use base64::Engine;
use lofty::config::ParseOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use log::warn;
use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Maximum allocation size for chapter data from untrusted files (16 MB).
const MAX_CHAPTER_ALLOC: usize = 16 * 1024 * 1024;

// ==========================================================================
// Chapter-extraction debug logging (off by default).
// When enabled, writes detailed atom traces to
// %APPDATA%/com.abplayer.app/chapter-debug.log on every MP4 scan.
// Flip to `true` to re-enable if a user reports a new file with missing
// chapters, then rebuild.
// ==========================================================================
const CHAPTER_DEBUG: bool = false;

fn debug_log_path() -> Option<std::path::PathBuf> {
    let app_data = std::env::var_os("APPDATA")?;
    let mut p = std::path::PathBuf::from(app_data);
    p.push("com.abplayer.app");
    std::fs::create_dir_all(&p).ok()?;
    p.push("chapter-debug.log");
    Some(p)
}

fn dbg_log(msg: impl std::fmt::Display) {
    if !CHAPTER_DEBUG {
        return;
    }
    use std::io::Write;
    if let Some(path) = debug_log_path() {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(&path)
        {
            let _ = writeln!(f, "{}", msg);
        }
    }
}

fn atom_type_str(atom: &[u8; 4]) -> String {
    String::from_utf8_lossy(atom).to_string()
}

fn format_hex_dump(bytes: &[u8]) -> String {
    let mut lines = Vec::new();
    for (chunk_idx, chunk) in bytes.chunks(16).enumerate() {
        let hex_parts: Vec<String> = chunk.iter().map(|b| format!("{:02x}", b)).collect();
        let ascii: String = chunk
            .iter()
            .map(|&b| {
                if (0x20..0x7f).contains(&b) {
                    b as char
                } else {
                    '.'
                }
            })
            .collect();
        lines.push(format!(
            "    {:08x}  {:<47}  |{}|",
            chunk_idx * 16,
            hex_parts.join(" "),
            ascii
        ));
    }
    lines.join("\n")
}

/// Enumerate top-level child atom types within a byte range (for debug logs).
fn list_child_atoms(reader: &mut (impl Read + Seek), start: u64, end: u64, cap: usize) -> String {
    let mut pos = start;
    let mut items: Vec<String> = Vec::new();
    while pos + 8 <= end && items.len() < cap {
        match read_atom_header(reader, pos) {
            Some((atype, size, _)) => {
                items.push(format!("{}({})", atom_type_str(&atype), size));
                if size < 8 {
                    break;
                }
                pos += size;
            }
            None => break,
        }
    }
    items.join(", ")
}

#[derive(Debug, Serialize)]
pub struct AudioMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_secs: f64,
    pub cover_art: Option<String>,
    pub chapters: Vec<ChapterMeta>,
    /// "embedded", "sidecar" or "none" — where `chapters` came from.
    pub chapter_source: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChapterMeta {
    pub title: String,
    pub start_time_ms: f64,
}

// ---- Helpers ----

fn read_u16(data: &[u8]) -> u16 {
    u16::from_be_bytes([data[0], data[1]])
}

fn read_u32(data: &[u8]) -> u32 {
    u32::from_be_bytes([data[0], data[1], data[2], data[3]])
}

fn read_u64(data: &[u8]) -> u64 {
    u64::from_be_bytes([
        data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7],
    ])
}

/// Decode bytes as a chapter title, handling UTF-8, UTF-16 BE/LE, and Latin-1.
fn decode_title(raw: &[u8]) -> String {
    // UTF-16 with BOM first: trailing NULs must be stripped as code units
    // (pairs), not bytes — a byte-wise strip eats the high byte of the last
    // LE character ("Hi" = 48 00 69 00 would lose the "i").
    if raw.len() >= 2 {
        if raw[0] == 0xFE && raw[1] == 0xFF {
            return decode_utf16_be(&raw[2..])
                .trim_end_matches('\0')
                .to_string();
        }
        if raw[0] == 0xFF && raw[1] == 0xFE {
            return decode_utf16_le(&raw[2..])
                .trim_end_matches('\0')
                .to_string();
        }
    }

    // Strip trailing nulls
    let raw = {
        let mut end = raw.len();
        while end > 0 && raw[end - 1] == 0 {
            end -= 1;
        }
        &raw[..end]
    };

    if raw.is_empty() {
        return String::new();
    }

    // Try UTF-8 first
    if let Ok(s) = std::str::from_utf8(raw) {
        // Check if it looks reasonable (no replacement chars, no excessive control chars)
        if !s.contains('\u{FFFD}') && s.chars().all(|c| !c.is_control() || c == '\n' || c == '\r') {
            return s.to_string();
        }
    }

    // Heuristic: if many bytes are 0x00, likely UTF-16 BE (common in M4B chapter tracks)
    let null_count = raw.iter().filter(|&&b| b == 0).count();
    if raw.len() >= 4 && null_count > raw.len() / 4 {
        // Try UTF-16 BE (more common in Apple/iTunes files)
        let be = decode_utf16_be(raw);
        if !be.is_empty() && be.chars().all(|c| !c.is_control() || c == '\n') {
            return be;
        }
        // Try UTF-16 LE
        let le = decode_utf16_le(raw);
        if !le.is_empty() && le.chars().all(|c| !c.is_control() || c == '\n') {
            return le;
        }
    }

    // Fallback: Latin-1 / ISO-8859-1
    raw.iter().map(|&b| b as char).collect()
}

fn decode_utf16_be(data: &[u8]) -> String {
    let u16s: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&u16s)
}

fn decode_utf16_le(data: &[u8]) -> String {
    let u16s: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&u16s)
}

// ---- MP4 Atom Traversal ----

/// Read an atom header, handling both standard (32-bit) and extended (64-bit) sizes.
/// Returns (atom_type as [u8;4], total atom size including header, header size).
fn read_atom_header(reader: &mut (impl Read + Seek), pos: u64) -> Option<([u8; 4], u64, u64)> {
    let mut header = [0u8; 8];
    reader.seek(SeekFrom::Start(pos)).ok()?;
    reader.read_exact(&mut header).ok()?;

    let size32 = read_u32(&header[0..4]) as u64;
    let mut atom_type = [0u8; 4];
    atom_type.copy_from_slice(&header[4..8]);

    if size32 == 1 {
        // Extended 64-bit size
        let mut ext = [0u8; 8];
        reader.read_exact(&mut ext).ok()?;
        let size64 = read_u64(&ext);
        Some((atom_type, size64, 16))
    } else if size32 == 0 {
        // Atom extends to end of file — get file size
        let file_end = reader.seek(SeekFrom::End(0)).ok()?;
        Some((atom_type, file_end - pos, 8))
    } else if size32 < 8 {
        None // invalid
    } else {
        Some((atom_type, size32, 8))
    }
}

/// Find an atom within a byte range. Handles extended atom sizes.
fn find_atom(
    reader: &mut (impl Read + Seek),
    start: u64,
    end: u64,
    target: &[u8; 4],
) -> Option<(u64, u64)> {
    let mut pos = start;

    while pos + 8 <= end {
        let (atom_type, size, _header_size) = read_atom_header(reader, pos)?;
        if size < 8 || pos + size > end + 8 {
            break;
        }
        if &atom_type == target {
            return Some((pos, size));
        }
        pos += size;
    }
    None
}

/// Find ALL atoms of a given type within a range.
fn find_all_atoms(
    reader: &mut (impl Read + Seek),
    start: u64,
    end: u64,
    target: &[u8; 4],
) -> Vec<(u64, u64)> {
    let mut results = Vec::new();
    let mut pos = start;

    while pos + 8 <= end {
        match read_atom_header(reader, pos) {
            Some((atom_type, size, _)) => {
                if size < 8 || pos + size > end + 8 {
                    break;
                }
                if &atom_type == target {
                    results.push((pos, size));
                }
                pos += size;
            }
            None => break,
        }
    }
    results
}

/// Get the data start position (after the atom header).
fn atom_data_start(reader: &mut (impl Read + Seek), atom_pos: u64) -> Option<u64> {
    let (_, _, header_size) = read_atom_header(reader, atom_pos)?;
    Some(atom_pos + header_size)
}

// ---- Nero Chapters (moov/udta/chpl) ----

fn extract_nero_chapters(
    reader: &mut (impl Read + Seek),
    moov_start: u64,
    moov_end: u64,
    max_reasonable_ms: f64,
) -> Vec<ChapterMeta> {
    let udta = match find_atom(reader, moov_start, moov_end, b"udta") {
        Some(v) => v,
        None => {
            dbg_log("  Nero: no moov/udta atom");
            return Vec::new();
        }
    };
    dbg_log(format!("  Nero: udta @ {} size {}", udta.0, udta.1));
    let udta_data = match atom_data_start(reader, udta.0) {
        Some(s) => s,
        None => return Vec::new(),
    };

    if CHAPTER_DEBUG {
        dbg_log(format!(
            "  Nero: udta children: [{}]",
            list_child_atoms(reader, udta_data, udta.0 + udta.1, 20)
        ));

        // If a meta atom is present, probe its structure — chapters for some
        // Audible/iTunes-derived files live in moov/udta/meta/ilst/*
        if let Some((meta_pos, meta_size)) = find_atom(reader, udta_data, udta.0 + udta.1, b"meta")
        {
            dbg_log(format!("  meta: @ {} size {}", meta_pos, meta_size));
            // meta is a "FullBox" so it has a 4-byte version/flags after the
            // 8-byte atom header. But some encoders omit it — try both.
            let hdr_start = meta_pos + 8;
            let data_with_vflags = meta_pos + 12;
            let end = meta_pos + meta_size;

            // Read 4 bytes at hdr_start: if it looks like an atom (size<end-hdr),
            // assume no version/flags; otherwise assume +4 for version/flags.
            let mut probe = [0u8; 4];
            let children_start = if reader.seek(SeekFrom::Start(hdr_start + 4)).is_ok()
                && reader.read_exact(&mut probe).is_ok()
                && probe == *b"hdlr"
            {
                hdr_start
            } else {
                data_with_vflags
            };
            dbg_log(format!(
                "  meta children (start={}): [{}]",
                children_start,
                list_child_atoms(reader, children_start, end, 20)
            ));

            // If ilst is inside, enumerate its children too
            if let Some((ilst_pos, ilst_size)) = find_atom(reader, children_start, end, b"ilst") {
                dbg_log(format!("  meta/ilst: @ {} size {}", ilst_pos, ilst_size));
                if let Some(ilst_data) = atom_data_start(reader, ilst_pos) {
                    dbg_log(format!(
                        "  meta/ilst children: [{}]",
                        list_child_atoms(reader, ilst_data, ilst_pos + ilst_size, 40)
                    ));

                    // Dump every ilst child (skipping only covr and free).
                    // Text-y atoms get up to 256 bytes so we can see if `desc`
                    // or `©cmt` contain a formatted chapter list.
                    let mut pos = ilst_data;
                    let ilst_end = ilst_pos + ilst_size;
                    let mut dump_count = 0;
                    while pos + 8 <= ilst_end && dump_count < 25 {
                        if let Some((atype, size, hsize)) = read_atom_header(reader, pos) {
                            if size < 8 {
                                break;
                            }
                            let atom_name = atom_type_str(&atype);
                            if &atype == b"covr" || &atype == b"free" {
                                dbg_log(format!(
                                    "  ilst[{}] size={} (skipped — covr/free)",
                                    atom_name, size
                                ));
                            } else if size <= 8192 {
                                let data_start = pos + hsize;
                                let data_end = pos + size;
                                // Larger dump for text-y atoms; tighter for small tags.
                                let limit = if size > 128 { 256 } else { 96 };
                                let read_len = (data_end - data_start).min(limit) as usize;
                                let mut buf = vec![0u8; read_len];
                                if reader.seek(SeekFrom::Start(data_start)).is_ok()
                                    && reader.read_exact(&mut buf).is_ok()
                                {
                                    dbg_log(format!(
                                        "  ilst[{}] size={} first {} bytes:\n{}",
                                        atom_name,
                                        size,
                                        read_len,
                                        format_hex_dump(&buf)
                                    ));
                                }
                                dump_count += 1;
                            } else {
                                dbg_log(format!(
                                    "  ilst[{}] size={} (skipped — too large)",
                                    atom_name, size
                                ));
                            }
                            pos += size;
                        } else {
                            break;
                        }
                    }
                }
            }
        }
    }

    let chpl = match find_atom(reader, udta_data, udta.0 + udta.1, b"chpl") {
        Some(v) => v,
        None => {
            dbg_log("  Nero: udta found but no chpl child");
            return Vec::new();
        }
    };
    dbg_log(format!("  Nero: chpl @ {} size {}", chpl.0, chpl.1));
    let chpl_data = match atom_data_start(reader, chpl.0) {
        Some(s) => s,
        None => return Vec::new(),
    };

    let data_size = (chpl.0 + chpl.1 - chpl_data) as usize;
    if data_size < 9 {
        return Vec::new();
    }

    let mut data = vec![0u8; data_size];
    if reader.seek(SeekFrom::Start(chpl_data)).is_err() || reader.read_exact(&mut data).is_err() {
        return Vec::new();
    }

    if CHAPTER_DEBUG {
        let dump_len = data.len().min(128);
        dbg_log(format!(
            "  Nero: chpl first {} bytes:\n{}",
            dump_len,
            format_hex_dump(&data[..dump_len])
        ));
    }

    let version = data[0];
    let mut offset = 8;

    let count = if version == 1 {
        if data.len() < offset + 4 {
            return Vec::new();
        }
        let c = read_u32(&data[offset..offset + 4]) as usize;
        offset += 4;
        c
    } else {
        if data.len() < offset + 1 {
            return Vec::new();
        }
        let c = data[offset] as usize;
        offset += 1;
        c
    };
    dbg_log(format!(
        "  Nero: chpl version={} claimed_count={}",
        version, count
    ));

    let mut chapters = Vec::with_capacity(count);
    for i in 0..count {
        if offset + 9 > data.len() {
            break;
        }

        let start_100ns = read_u64(&data[offset..offset + 8]);
        offset += 8;

        let title_len = data[offset] as usize;
        offset += 1;

        let title = if offset + title_len <= data.len() {
            let raw = &data[offset..offset + title_len];
            offset += title_len;
            let decoded = decode_title(raw);
            if decoded.trim().is_empty() {
                format!("Chapter {}", i + 1)
            } else {
                decoded
            }
        } else {
            format!("Chapter {}", i + 1)
        };

        let start_ms = (start_100ns as f64) / 10_000.0;
        chapters.push(ChapterMeta {
            title,
            start_time_ms: start_ms,
        });
    }

    // Sanity gate: if any timestamp is wildly beyond the file's duration, the
    // chpl we parsed is a stub/garbage (Audible Frontiers / Graphic Audio and
    // some other encoders write 44-byte stubs that don't actually contain
    // chapter data). Discard the whole result rather than show junk.
    let out_of_range = chapters.iter().any(|c| c.start_time_ms > max_reasonable_ms);
    if out_of_range {
        dbg_log(format!(
            "  Nero: SANITY GATE REJECTED — at least one timestamp > {:.0}ms (file likely has a stub chpl; real chapters elsewhere)",
            max_reasonable_ms
        ));
        return Vec::new();
    }

    chapters
}

// ---- QuickTime Chapter Track ----

fn extract_qt_chapters(
    reader: &mut (impl Read + Seek),
    moov_start: u64,
    moov_end: u64,
) -> Vec<ChapterMeta> {
    let traks = find_all_atoms(reader, moov_start, moov_end, b"trak");
    dbg_log(format!("  QT: found {} trak(s)", traks.len()));
    if traks.is_empty() {
        return Vec::new();
    }

    // Find which trak has a tref/chap pointing to a chapter track
    let mut chapter_track_id: Option<u32> = None;
    for (idx, &(trak_pos, trak_size)) in traks.iter().enumerate() {
        let trak_data = match atom_data_start(reader, trak_pos) {
            Some(s) => s,
            None => continue,
        };
        let trak_end = trak_pos + trak_size;

        if let Some((tref_pos, tref_size)) = find_atom(reader, trak_data, trak_end, b"tref") {
            let tref_data = match atom_data_start(reader, tref_pos) {
                Some(s) => s,
                None => continue,
            };
            if let Some((chap_pos, chap_size)) =
                find_atom(reader, tref_data, tref_pos + tref_size, b"chap")
            {
                let chap_data = match atom_data_start(reader, chap_pos) {
                    Some(s) => s,
                    None => continue,
                };
                if chap_size >= 12 {
                    let mut id_buf = [0u8; 4];
                    if reader.seek(SeekFrom::Start(chap_data)).is_ok()
                        && reader.read_exact(&mut id_buf).is_ok()
                    {
                        let id = read_u32(&id_buf);
                        dbg_log(format!(
                            "  QT: trak #{} has tref/chap -> track_id={}",
                            idx, id
                        ));
                        chapter_track_id = Some(id);
                    }
                }
            }
        }
    }

    let chapter_track_id = match chapter_track_id {
        Some(id) => id,
        None => {
            dbg_log("  QT: no trak has a tref/chap reference — no Apple-style chapter track");
            return Vec::new();
        }
    };

    // Find the trak with matching track ID
    for &(trak_pos, trak_size) in &traks {
        let trak_data = match atom_data_start(reader, trak_pos) {
            Some(s) => s,
            None => continue,
        };
        let trak_end = trak_pos + trak_size;

        if let Some((tkhd_pos, _tkhd_size)) = find_atom(reader, trak_data, trak_end, b"tkhd") {
            let tkhd_data = match atom_data_start(reader, tkhd_pos) {
                Some(s) => s,
                None => continue,
            };
            let mut tkhd_buf = [0u8; 24];
            if reader.seek(SeekFrom::Start(tkhd_data)).is_err()
                || reader.read_exact(&mut tkhd_buf).is_err()
            {
                continue;
            }
            let version = tkhd_buf[0];
            let track_id = if version == 0 {
                read_u32(&tkhd_buf[12..16])
            } else {
                read_u32(&tkhd_buf[20..24])
            };

            if track_id == chapter_track_id {
                dbg_log(format!(
                    "  QT: located chapter trak (track_id={})",
                    track_id
                ));
                return extract_chapter_track_data(reader, trak_data, trak_end);
            }
        }
    }

    dbg_log(format!(
        "  QT: tref/chap pointed to track_id={} but no trak with that id found",
        chapter_track_id
    ));
    Vec::new()
}

fn extract_chapter_track_data(
    reader: &mut (impl Read + Seek),
    trak_data: u64,
    trak_end: u64,
) -> Vec<ChapterMeta> {
    let mdia = match find_atom(reader, trak_data, trak_end, b"mdia") {
        Some(v) => v,
        None => {
            dbg_log("  chap_track: no mdia atom");
            return Vec::new();
        }
    };
    let mdia_data = match atom_data_start(reader, mdia.0) {
        Some(s) => s,
        None => return Vec::new(),
    };
    let mdia_end = mdia.0 + mdia.1;

    // Get timescale from mdhd
    let mut timescale: u32 = 1000;
    if let Some((mdhd_pos, _)) = find_atom(reader, mdia_data, mdia_end, b"mdhd") {
        let mdhd_data = atom_data_start(reader, mdhd_pos).unwrap_or_default();
        if mdhd_data > 0 {
            let mut buf = [0u8; 24];
            if reader.seek(SeekFrom::Start(mdhd_data)).is_ok()
                && reader.read_exact(&mut buf).is_ok()
            {
                let version = buf[0];
                timescale = if version == 0 {
                    read_u32(&buf[12..16])
                } else {
                    read_u32(&buf[20..24])
                };
                if timescale == 0 {
                    timescale = 1000;
                }
            }
        }
    }

    let minf = match find_atom(reader, mdia_data, mdia_end, b"minf") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let minf_data = match atom_data_start(reader, minf.0) {
        Some(s) => s,
        None => return Vec::new(),
    };
    let stbl = match find_atom(reader, minf_data, minf.0 + minf.1, b"stbl") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let stbl_data = match atom_data_start(reader, stbl.0) {
        Some(s) => s,
        None => return Vec::new(),
    };
    let stbl_end = stbl.0 + stbl.1;

    // stts: sample durations
    let mut durations: Vec<u64> = Vec::new();
    if let Some((stts_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"stts") {
        let stts_data = atom_data_start(reader, stts_pos).unwrap_or_default();
        if stts_data > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(stts_data)).is_ok()
                && reader.read_exact(&mut header).is_ok()
            {
                let entry_count = read_u32(&header[4..8]) as usize;
                let alloc_size = entry_count.saturating_mul(8);
                if alloc_size > MAX_CHAPTER_ALLOC {
                    return Vec::new();
                }
                let mut entries = vec![0u8; alloc_size];
                if reader.read_exact(&mut entries).is_ok() {
                    for i in 0..entry_count {
                        let off = i * 8;
                        let sample_count = read_u32(&entries[off..off + 4]);
                        let sample_duration = read_u32(&entries[off + 4..off + 8]);
                        for _ in 0..sample_count.min(100_000) {
                            durations.push(sample_duration as u64);
                        }
                    }
                }
            }
        }
    }

    // stco or co64: chunk offsets
    let mut chunk_offsets: Vec<u64> = Vec::new();
    if let Some((stco_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"stco") {
        let data_start = atom_data_start(reader, stco_pos).unwrap_or_default();
        if data_start > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(data_start)).is_ok()
                && reader.read_exact(&mut header).is_ok()
            {
                let count = read_u32(&header[4..8]) as usize;
                let alloc_size = count.saturating_mul(4);
                if alloc_size <= MAX_CHAPTER_ALLOC {
                    let mut entries = vec![0u8; alloc_size];
                    if reader.read_exact(&mut entries).is_ok() {
                        for i in 0..count {
                            chunk_offsets.push(read_u32(&entries[i * 4..i * 4 + 4]) as u64);
                        }
                    }
                }
            }
        }
    } else if let Some((co64_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"co64") {
        let data_start = atom_data_start(reader, co64_pos).unwrap_or_default();
        if data_start > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(data_start)).is_ok()
                && reader.read_exact(&mut header).is_ok()
            {
                let count = read_u32(&header[4..8]) as usize;
                let alloc_size = count.saturating_mul(8);
                if alloc_size > MAX_CHAPTER_ALLOC {
                    return Vec::new();
                }
                let mut entries = vec![0u8; alloc_size];
                if reader.read_exact(&mut entries).is_ok() {
                    for i in 0..count {
                        chunk_offsets.push(read_u64(&entries[i * 8..i * 8 + 8]));
                    }
                }
            }
        }
    }

    // stsz: sample sizes
    let mut sample_sizes: Vec<u32> = Vec::new();
    if let Some((stsz_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"stsz") {
        let data_start = atom_data_start(reader, stsz_pos).unwrap_or_default();
        if data_start > 0 {
            let mut header = [0u8; 12];
            if reader.seek(SeekFrom::Start(data_start)).is_ok()
                && reader.read_exact(&mut header).is_ok()
            {
                let default_size = read_u32(&header[4..8]);
                let sample_count = read_u32(&header[8..12]) as usize;
                let alloc_size = sample_count.saturating_mul(4);
                if alloc_size <= MAX_CHAPTER_ALLOC {
                    if default_size > 0 {
                        sample_sizes = vec![default_size; sample_count];
                    } else {
                        let mut entries = vec![0u8; alloc_size];
                        if reader.read_exact(&mut entries).is_ok() {
                            for i in 0..sample_count {
                                sample_sizes.push(read_u32(&entries[i * 4..i * 4 + 4]));
                            }
                        }
                    }
                }
            }
        }
    }

    // stsc: sample-to-chunk mapping.
    // Each entry: (first_chunk_1based, samples_per_chunk, sample_description_index)
    // The entry applies from first_chunk until the NEXT entry's first_chunk.
    let mut stsc: Vec<(u32, u32, u32)> = Vec::new();
    if let Some((stsc_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"stsc") {
        let data_start = atom_data_start(reader, stsc_pos).unwrap_or_default();
        if data_start > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(data_start)).is_ok()
                && reader.read_exact(&mut header).is_ok()
            {
                let entry_count = read_u32(&header[4..8]) as usize;
                let alloc_size = entry_count.saturating_mul(12);
                if alloc_size <= MAX_CHAPTER_ALLOC {
                    let mut entries = vec![0u8; alloc_size];
                    if reader.read_exact(&mut entries).is_ok() {
                        for i in 0..entry_count {
                            let off = i * 12;
                            let first_chunk = read_u32(&entries[off..off + 4]);
                            let spc = read_u32(&entries[off + 4..off + 8]);
                            let sdi = read_u32(&entries[off + 8..off + 12]);
                            stsc.push((first_chunk, spc, sdi));
                        }
                    }
                }
            }
        }
    }

    // Resolve each sample's file offset using stsc + chunk_offsets + sample_sizes.
    // Without stsc, we fall back to the old "1 sample per chunk" behavior — which
    // is only correct when there are exactly as many chunks as samples.
    let sample_count = sample_sizes.len();
    let mut sample_offsets: Vec<u64> = Vec::with_capacity(sample_count);

    if stsc.is_empty() {
        for &off in chunk_offsets.iter().take(sample_count) {
            sample_offsets.push(off);
        }
    } else {
        let mut sample_idx = 0usize;
        'outer: for (chunk_idx, &chunk_off) in chunk_offsets.iter().enumerate() {
            // Find the last stsc entry whose first_chunk <= chunk_idx+1.
            let target_chunk = (chunk_idx + 1) as u32;
            let mut spc: u32 = 1;
            for (fc, s_per_c, _) in &stsc {
                if *fc <= target_chunk {
                    spc = *s_per_c;
                } else {
                    break;
                }
            }
            let mut running_offset = chunk_off;
            for _ in 0..spc {
                if sample_idx >= sample_count {
                    break 'outer;
                }
                sample_offsets.push(running_offset);
                running_offset += sample_sizes[sample_idx] as u64;
                sample_idx += 1;
            }
        }
    }

    dbg_log(format!(
        "  chap_track: timescale={}, durations={}, chunks={}, samples={}, stsc_entries={}, resolved_offsets={}",
        timescale,
        durations.len(),
        chunk_offsets.len(),
        sample_count,
        stsc.len(),
        sample_offsets.len()
    ));

    // Read chapter titles
    let mut chapters = Vec::new();
    let mut current_time: u64 = 0;
    let count = sample_offsets.len().min(sample_sizes.len());

    for i in 0..count {
        let offset = sample_offsets[i];
        let size = sample_sizes[i] as usize;
        let start_ms = (current_time as f64 / timescale as f64) * 1000.0;

        // MP4 text sample: 2-byte BE length prefix, then text bytes
        let read_size = size.min(1024);
        let mut buf = vec![0u8; read_size];
        let title = if reader.seek(SeekFrom::Start(offset)).is_ok()
            && reader.read_exact(&mut buf).is_ok()
            && buf.len() >= 2
        {
            let text_len = read_u16(&buf[0..2]) as usize;
            let end = (2 + text_len).min(buf.len());
            let decoded = decode_title(&buf[2..end]);
            if decoded.trim().is_empty() {
                format!("Chapter {}", i + 1)
            } else {
                decoded
            }
        } else {
            format!("Chapter {}", i + 1)
        };

        chapters.push(ChapterMeta {
            title,
            start_time_ms: start_ms,
        });

        if i < durations.len() {
            current_time += durations[i];
        }
    }

    chapters
}

// ---- ID3v2 chapters (MP3) ----
//
// `CHAP` frames (ID3v2.3 / 2.4): an element id, start and end in ms, two byte
// offsets, then embedded sub-frames of which `TIT2` carries the title. Only
// the tag at the head of the file is read, never the audio.

fn syncsafe_u32(b: &[u8]) -> u32 {
    ((b[0] as u32 & 0x7F) << 21)
        | ((b[1] as u32 & 0x7F) << 14)
        | ((b[2] as u32 & 0x7F) << 7)
        | (b[3] as u32 & 0x7F)
}

/// Undo ID3v2 unsynchronisation: every `FF 00` becomes `FF`.
fn id3_deunsync(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        out.push(data[i]);
        if data[i] == 0xFF && i + 1 < data.len() && data[i + 1] == 0x00 {
            i += 2;
        } else {
            i += 1;
        }
    }
    out
}

/// Text by its ID3v2 encoding byte: 0 Latin-1, 1 UTF-16 with BOM, 2 UTF-16BE, 3 UTF-8.
fn decode_id3_text(encoding: u8, data: &[u8]) -> String {
    let s = match encoding {
        0 => data.iter().map(|&b| b as char).collect::<String>(),
        1 => {
            if data.len() >= 2 && data[0] == 0xFE && data[1] == 0xFF {
                decode_utf16_be(&data[2..])
            } else if data.len() >= 2 && data[0] == 0xFF && data[1] == 0xFE {
                decode_utf16_le(&data[2..])
            } else {
                decode_utf16_le(data)
            }
        }
        2 => decode_utf16_be(data),
        _ => String::from_utf8_lossy(data).into_owned(),
    };
    s.trim_end_matches('\0').trim().to_string()
}

/// Split a run of ID3v2 frames into (id, body). Version 3 uses plain
/// big-endian sizes; version 4 syncsafe sizes and per-frame flags.
fn id3_frames(data: &[u8], version: u8) -> Vec<([u8; 4], Vec<u8>)> {
    let mut frames = Vec::new();
    let mut pos = 0usize;
    while pos + 10 <= data.len() {
        let id = [data[pos], data[pos + 1], data[pos + 2], data[pos + 3]];
        // Padding, or something that is not a frame id: the frames are over
        if !id
            .iter()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        {
            break;
        }
        let size = if version >= 4 {
            syncsafe_u32(&data[pos + 4..pos + 8])
        } else {
            read_u32(&data[pos + 4..pos + 8])
        } as usize;
        let flags = read_u16(&data[pos + 8..pos + 10]);
        pos += 10;
        if size == 0 || pos + size > data.len() {
            break;
        }
        let mut body = &data[pos..pos + size];
        pos += size;

        if version >= 4 {
            // 0x0008 compressed, 0x0004 encrypted: not readable here
            if flags & 0x000C != 0 {
                continue;
            }
            if flags & 0x0040 != 0 && !body.is_empty() {
                body = &body[1..]; // grouping identity byte
            }
            if flags & 0x0001 != 0 {
                if body.len() < 4 {
                    continue;
                }
                body = &body[4..]; // data length indicator
            }
            if flags & 0x0002 != 0 {
                frames.push((id, id3_deunsync(body)));
                continue;
            }
        } else {
            // v2.3: 0x0080 compressed, 0x0040 encrypted, 0x0020 grouping
            if flags & 0x00C0 != 0 {
                continue;
            }
            if flags & 0x0020 != 0 && !body.is_empty() {
                body = &body[1..];
            }
        }
        frames.push((id, body.to_vec()));
    }
    frames
}

/// One `CHAP` body → a chapter. The title is the embedded `TIT2`, else "Chapter N".
fn parse_chap(body: &[u8], version: u8, index: usize) -> Option<ChapterMeta> {
    let nul = body.iter().position(|&b| b == 0)?;
    let rest = &body[nul + 1..];
    if rest.len() < 16 {
        return None;
    }
    let start_ms = read_u32(&rest[0..4]);
    let mut title = String::new();
    for (id, sub) in id3_frames(&rest[16..], version) {
        if &id == b"TIT2" && !sub.is_empty() {
            title = decode_id3_text(sub[0], &sub[1..]);
            if !title.is_empty() {
                break;
            }
        }
    }
    if title.is_empty() {
        title = format!("Chapter {}", index + 1);
    }
    Some(ChapterMeta {
        title,
        start_time_ms: start_ms as f64,
    })
}

/// Chapters from an ID3v2 tag body (header already consumed), sorted by start.
fn id3_chapters_from_tag(tag: &[u8], version: u8, flags: u8) -> Vec<ChapterMeta> {
    // v2.3 unsynchronises the whole tag; v2.4 does it per frame (see id3_frames)
    let owned;
    let mut data: &[u8] = if version == 3 && flags & 0x80 != 0 {
        owned = id3_deunsync(tag);
        &owned
    } else {
        tag
    };
    if flags & 0x40 != 0 {
        // Extended header: v2.3's size excludes its own four bytes, v2.4's
        // (syncsafe) includes them
        if data.len() < 4 {
            return Vec::new();
        }
        let ext = if version >= 4 {
            syncsafe_u32(&data[..4]) as usize
        } else {
            read_u32(&data[..4]) as usize + 4
        };
        if ext > data.len() {
            return Vec::new();
        }
        data = &data[ext..];
    }
    let mut chapters: Vec<ChapterMeta> = Vec::new();
    for (id, body) in id3_frames(data, version) {
        if &id == b"CHAP" {
            if let Some(ch) = parse_chap(&body, version, chapters.len()) {
                chapters.push(ch);
            }
        }
    }
    sort_chapters(&mut chapters);
    chapters
}

fn sort_chapters(chapters: &mut [ChapterMeta]) {
    chapters.sort_by(|a, b| {
        a.start_time_ms
            .partial_cmp(&b.start_time_ms)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
}

/// Chapters from the ID3v2 tag at the head of `path`, or none.
fn extract_id3_chapters(path: &Path) -> Vec<ChapterMeta> {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let mut header = [0u8; 10];
    if file.read_exact(&mut header).is_err() || &header[..3] != b"ID3" {
        return Vec::new();
    }
    let version = header[3];
    if version != 3 && version != 4 {
        return Vec::new();
    }
    let flags = header[5];
    let size = syncsafe_u32(&header[6..10]) as usize;
    if size == 0 || size > MAX_CHAPTER_ALLOC {
        return Vec::new();
    }
    let mut tag = vec![0u8; size];
    if file.read_exact(&mut tag).is_err() {
        return Vec::new();
    }
    id3_chapters_from_tag(&tag, version, flags)
}

// ---- Sidecar chapters (.cue / .chapters.txt) ----
//
// Used only when the file itself carries no chapters. `Book.m4b` looks for
// `Book.cue`, `Book.chapters.txt`, `Book.m4b.cue` and `Book.m4b.chapters.txt`.

fn sidecar_path(audio: &Path) -> Option<std::path::PathBuf> {
    let dir = audio.parent()?;
    let file_name = audio.file_name()?.to_string_lossy().into_owned();
    let stem = audio.file_stem()?.to_string_lossy().into_owned();
    let candidates = [
        format!("{stem}.cue"),
        format!("{stem}.chapters.txt"),
        format!("{file_name}.cue"),
        format!("{file_name}.chapters.txt"),
    ];
    candidates.iter().map(|n| dir.join(n)).find(|p| p.is_file())
}

fn push_cue_track(chapters: &mut Vec<ChapterMeta>, title: Option<String>, start: Option<f64>) {
    if let Some(start_time_ms) = start {
        let n = chapters.len() + 1;
        chapters.push(ChapterMeta {
            title: title
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| format!("Chapter {n}")),
            start_time_ms,
        });
    }
}

/// `mm:ss:ff` (ff = 1/75 s) → ms.
fn parse_cue_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let m: f64 = parts[0].trim().parse().ok()?;
    let sec: f64 = parts[1].trim().parse().ok()?;
    let frames: f64 = parts[2].trim().parse().ok()?;
    Some(((m * 60.0 + sec) * 1000.0 + frames * 1000.0 / 75.0).round())
}

/// A cue sheet: each `TRACK` with its `TITLE` and `INDEX 01`. The album-level
/// `TITLE` before the first track is ignored.
fn parse_cue_sheet(text: &str) -> Vec<ChapterMeta> {
    let mut chapters = Vec::new();
    let mut in_track = false;
    let mut title: Option<String> = None;
    let mut start: Option<f64> = None;
    for raw in text.lines() {
        let line = raw.trim();
        let upper = line.to_ascii_uppercase();
        if upper.starts_with("TRACK ") {
            if in_track {
                push_cue_track(&mut chapters, title.take(), start.take());
            }
            in_track = true;
        } else if in_track && upper.starts_with("TITLE ") {
            title = Some(line[6..].trim().trim_matches('"').to_string());
        } else if in_track && upper.starts_with("INDEX 01 ") {
            start = parse_cue_time(line[9..].trim());
        }
    }
    if in_track {
        push_cue_track(&mut chapters, title, start);
    }
    chapters
}

/// `HH:MM:SS(.mmm)` or `MM:SS(.mmm)` → ms.
fn parse_clock_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let mut secs = 0.0;
    for p in &parts {
        secs = secs * 60.0 + p.trim().parse::<f64>().ok()?;
    }
    Some((secs * 1000.0).round())
}

/// One chapter per line: a clock time, whitespace, the title. `#` lines are comments.
fn parse_chapters_txt(text: &str) -> Vec<ChapterMeta> {
    let mut chapters = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (time, title) = match line.find(char::is_whitespace) {
            Some(i) => (&line[..i], line[i..].trim()),
            None => (line, ""),
        };
        if let Some(start_time_ms) = parse_clock_time(time) {
            let n = chapters.len() + 1;
            chapters.push(ChapterMeta {
                title: if title.is_empty() {
                    format!("Chapter {n}")
                } else {
                    title.to_string()
                },
                start_time_ms,
            });
        }
    }
    chapters
}

fn extract_sidecar_chapters(audio: &Path) -> Vec<ChapterMeta> {
    let Some(p) = sidecar_path(audio) else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(&p) else {
        return Vec::new();
    };
    let text = text.trim_start_matches('\u{feff}');
    let is_cue = p
        .extension()
        .map(|e| e.eq_ignore_ascii_case("cue"))
        .unwrap_or(false);
    let mut v = if is_cue {
        parse_cue_sheet(text)
    } else {
        parse_chapters_txt(text)
    };
    sort_chapters(&mut v);
    v
}

// ---- Main Entry ----

fn is_mp4_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref(),
        Some("m4b" | "m4a" | "mp4")
    )
}

fn extract_mp4_chapters(file_path: &Path, duration_secs: f64) -> Vec<ChapterMeta> {
    let path_display = file_path.display().to_string();
    dbg_log(format!("\n=== {} ===", path_display));

    let mut file = match std::fs::File::open(file_path) {
        Ok(f) => f,
        Err(e) => {
            dbg_log(format!("  open failed: {}", e));
            return Vec::new();
        }
    };

    let file_size = match file.seek(SeekFrom::End(0)) {
        Ok(s) => s,
        Err(e) => {
            dbg_log(format!("  seek failed: {}", e));
            return Vec::new();
        }
    };
    // Rewind for the atom walk; if this fails the first read below fails too.
    let _ = file.seek(SeekFrom::Start(0));
    dbg_log(format!("  file size: {} bytes", file_size));

    if CHAPTER_DEBUG {
        // Enumerate root-level atoms so we can see the file structure at a glance.
        let mut pos = 0u64;
        let mut root_atoms: Vec<String> = Vec::new();
        while pos + 8 <= file_size && root_atoms.len() < 20 {
            match read_atom_header(&mut file, pos) {
                Some((atype, size, _)) => {
                    root_atoms.push(format!("{}({})", atom_type_str(&atype), size));
                    if size < 8 {
                        break;
                    }
                    pos += size;
                }
                None => break,
            }
        }
        dbg_log(format!("  root atoms: [{}]", root_atoms.join(", ")));
        // Same: find_atom seeks to its own start position.
        let _ = file.seek(SeekFrom::Start(0));
    }

    let (moov_pos, moov_size) = match find_atom(&mut file, 0, file_size, b"moov") {
        Some(v) => v,
        None => {
            dbg_log("  moov: NOT FOUND (fragmented MP4 or non-standard structure?)");
            return Vec::new();
        }
    };
    dbg_log(format!("  moov: @ {} size {}", moov_pos, moov_size));

    let moov_data = match atom_data_start(&mut file, moov_pos) {
        Some(s) => s,
        None => {
            dbg_log("  moov: header unreadable");
            return Vec::new();
        }
    };
    let moov_end = moov_pos + moov_size;

    // Enumerate atoms inside moov
    if CHAPTER_DEBUG {
        let mut pos = moov_data;
        let mut moov_children: Vec<String> = Vec::new();
        while pos + 8 <= moov_end && moov_children.len() < 20 {
            match read_atom_header(&mut file, pos) {
                Some((atype, size, _)) => {
                    moov_children.push(format!("{}({})", atom_type_str(&atype), size));
                    if size < 8 {
                        break;
                    }
                    pos += size;
                }
                None => break,
            }
        }
        dbg_log(format!("  moov children: [{}]", moov_children.join(", ")));
    }

    // Try QuickTime chapters first (more structured, more common in Apple M4B)
    let chapters = extract_qt_chapters(&mut file, moov_data, moov_end);
    dbg_log(format!(
        "  QT extractor returned: {} chapters",
        chapters.len()
    ));
    if !chapters.is_empty() {
        for (i, ch) in chapters.iter().take(3).enumerate() {
            dbg_log(format!(
                "    [{}] {:.1}ms: {:?}",
                i, ch.start_time_ms, ch.title
            ));
        }
        return chapters;
    }

    // If QT extraction failed but the file only has 1 trak (no chapter track),
    // dump that trak's children — the real chapter markers might be nested
    // inside (some encoders put nested udta/chpl inside the audio trak).
    if CHAPTER_DEBUG {
        let traks = find_all_atoms(&mut file, moov_data, moov_end, b"trak");
        for (idx, &(trak_pos, trak_size)) in traks.iter().enumerate() {
            if let Some(trak_data) = atom_data_start(&mut file, trak_pos) {
                dbg_log(format!(
                    "  trak #{} children: [{}]",
                    idx,
                    list_child_atoms(&mut file, trak_data, trak_pos + trak_size, 20)
                ));
                // If this trak has its own udta, list that too.
                if let Some((trak_udta_pos, trak_udta_size)) =
                    find_atom(&mut file, trak_data, trak_pos + trak_size, b"udta")
                {
                    if let Some(trak_udta_data) = atom_data_start(&mut file, trak_udta_pos) {
                        dbg_log(format!(
                            "    trak #{} udta children: [{}]",
                            idx,
                            list_child_atoms(
                                &mut file,
                                trak_udta_data,
                                trak_udta_pos + trak_udta_size,
                                20
                            )
                        ));
                    }
                }
            }
        }
    }

    // Allow 20% over the file's declared duration + 60s slack before calling a
    // Nero timestamp "out of range". Real chapter start times cluster well
    // inside the file; stub atoms produce astronomically large values.
    let max_reasonable_ms = (duration_secs * 1.2 * 1000.0) + 60_000.0;

    // Fallback to Nero chapters
    let nero = extract_nero_chapters(&mut file, moov_data, moov_end, max_reasonable_ms);
    dbg_log(format!(
        "  Nero extractor returned: {} chapters",
        nero.len()
    ));
    if !nero.is_empty() {
        for (i, ch) in nero.iter().take(3).enumerate() {
            dbg_log(format!(
                "    [{}] {:.1}ms: {:?}",
                i, ch.start_time_ms, ch.title
            ));
        }
    }
    nero
}

#[tauri::command]
fn read_audio_meta(file_path: String) -> Result<AudioMeta, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        warn!("Metadata request for missing file: {}", file_path);
        return Err("File not found".to_string());
    }

    let opts = ParseOptions::new().parsing_mode(lofty::config::ParsingMode::Relaxed);

    let tagged_file = Probe::open(path)
        .map_err(|e| {
            warn!("Failed to open audio file {}: {}", file_path, e);
            "Failed to open audio file".to_string()
        })?
        .options(opts)
        .read()
        .map_err(|e| {
            warn!("Failed to read metadata for {}: {}", file_path, e);
            "Failed to read audio metadata".to_string()
        })?;

    let properties = tagged_file.properties();
    let duration_secs = properties.duration().as_secs_f64();

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (title, artist, album, cover_art) = if let Some(t) = tag {
        let title = t.title().map(|s| s.to_string());
        let artist = t.artist().map(|s| s.to_string());
        let album = t.album().map(|s| s.to_string());

        let cover_art = t
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| t.pictures().first())
            .map(|pic| {
                let mime = pic
                    .mime_type()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| "image/jpeg".to_string());
                let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
                format!("data:{};base64,{}", mime, b64)
            });

        (title, artist, album, cover_art)
    } else {
        (None, None, None, None)
    };

    let embedded = if is_mp4_file(path) {
        let v = extract_mp4_chapters(path, duration_secs);
        dbg_log(format!(
            "  final chapter count returned to frontend: {}",
            v.len()
        ));
        dbg_log(format!(
            "  lofty duration: {:.2}s, title: {:?}, album: {:?}",
            duration_secs, title, album
        ));
        v
    } else {
        extract_id3_chapters(path)
    };

    // A sidecar next to the file only fills in for a file with no chapters
    // of its own; it never overrides embedded ones.
    let (chapters, chapter_source) = if !embedded.is_empty() {
        (embedded, "embedded")
    } else {
        let side = extract_sidecar_chapters(path);
        if side.is_empty() {
            (side, "none")
        } else {
            (side, "sidecar")
        }
    };

    let effective_title = effective_title(title, album.as_deref(), chapters.first());

    Ok(AudioMeta {
        title: effective_title,
        artist,
        album,
        duration_secs,
        cover_art,
        chapters,
        chapter_source: chapter_source.to_string(),
    })
}

/// Title fallback: some encoders (Audible, iTunes) write the first chapter's
/// name into the track title atom. If the parsed title matches the first
/// chapter's title and an album tag exists, the album is almost always the
/// real book title.
fn effective_title(
    title: Option<String>,
    album: Option<&str>,
    first_chapter: Option<&ChapterMeta>,
) -> Option<String> {
    match (title.as_deref(), album, first_chapter) {
        (Some(t), Some(a), Some(first)) if t.trim().eq_ignore_ascii_case(first.title.trim()) => {
            dbg_log(format!(
                "  title fallback: '{}' matches first chapter, using album '{}'",
                t, a
            ));
            Some(a.to_string())
        }
        _ => title,
    }
}

// ---- Audio streaming protocol with CORS headers ----

/// Open-ended `Range: bytes=N-` requests are capped at this many bytes per
/// response. Critical for M4B files with the moov atom at the end of the file:
/// the browser issues many sequential range requests near EOF to locate and
/// parse the chapter index / sample table, and a smaller cap (2 MB originally)
/// forced tens of round trips before audio could begin — 30–60 s first-play
/// latency on 400+ MB files vs ~10 s with 16 MB.
const OPEN_RANGE_CHUNK: u64 = 16 * 1024 * 1024;

/// Resolve an HTTP `Range` header value against a file size.
/// Returns the inclusive `(start, end)` byte range to serve, or `None` when
/// the range is unsatisfiable (the caller answers 416).
fn parse_range(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let range_str = range.strip_prefix("bytes=").unwrap_or(range);
    let parts: Vec<&str> = range_str.splitn(2, '-').collect();
    let start: u64 = parts[0].parse().unwrap_or(0);
    let end: u64 = if parts.len() > 1 && !parts[1].is_empty() {
        parts[1].parse().unwrap_or(file_size.saturating_sub(1))
    } else {
        std::cmp::min(start + OPEN_RANGE_CHUNK - 1, file_size.saturating_sub(1))
    };
    if start >= file_size || end < start {
        return None;
    }
    Some((start, std::cmp::min(end, file_size - 1)))
}

fn url_decode(input: &str) -> String {
    percent_encoding::percent_decode_str(input)
        .decode_utf8_lossy()
        .into_owned()
}

fn audio_content_type(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".m4b") || lower.ends_with(".m4a") || lower.ends_with(".mp4") {
        "audio/mp4"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".ogg") || lower.ends_with(".oga") {
        "audio/ogg"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else {
        "application/octet-stream"
    }
}

const CORS_HEADERS: [(&str, &str); 3] = [
    ("Access-Control-Allow-Origin", "*"),
    (
        "Access-Control-Expose-Headers",
        "Content-Range, Content-Length, Accept-Ranges",
    ),
    ("Content-Disposition", "inline"),
];

fn cors_error(status: u16, msg: &[u8]) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .body(msg.to_vec())
        .unwrap()
}

fn handle_audio_stream(
    request: tauri::http::Request<Vec<u8>>,
) -> Result<tauri::http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    use std::io::{Read as IoRead, Seek as IoSeek, SeekFrom};

    // Handle CORS preflight
    if request.method().as_str() == "OPTIONS" {
        return Ok(tauri::http::Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .header("Access-Control-Max-Age", "86400")
            .body(Vec::new())?);
    }

    let uri = request.uri().to_string();

    // Parse file path from URI
    let raw_path = uri
        .strip_prefix("https://audiostream.localhost/")
        .or_else(|| uri.strip_prefix("http://audiostream.localhost/"))
        .or_else(|| uri.strip_prefix("audiostream://localhost/"))
        .unwrap_or("");
    let raw_path = raw_path.split('?').next().unwrap_or(raw_path);
    let decoded_path = url_decode(raw_path);

    if decoded_path.is_empty() {
        return Ok(cors_error(400, b"Missing file path"));
    }

    // Security: canonicalize to prevent directory traversal (../ attacks)
    let canonical = match std::fs::canonicalize(&decoded_path) {
        Ok(p) => p,
        Err(_) => return Ok(cors_error(404, b"File not found")),
    };

    // Verify it's a file, not a directory
    if !canonical.is_file() {
        return Ok(cors_error(400, b"Not a file"));
    }

    let path_str = canonical.to_string_lossy().to_string();
    let file_size = std::fs::metadata(&canonical)?.len();
    let content_type = audio_content_type(&path_str);

    // Parse Range header
    let range_header = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut builder = tauri::http::Response::builder();
    for (k, v) in &CORS_HEADERS {
        builder = builder.header(*k, *v);
    }
    builder = builder
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "public, max-age=31536000, immutable");

    if let Some(range) = range_header {
        let (start, end) = match parse_range(&range, file_size) {
            Some(r) => r,
            None => {
                return Ok(tauri::http::Response::builder()
                    .status(416)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Content-Range", format!("bytes */{}", file_size))
                    .body(Vec::new())?);
            }
        };
        let length = (end - start + 1) as usize;

        let mut file = std::fs::File::open(&canonical)?;
        file.seek(SeekFrom::Start(start))?;
        let mut buf = vec![0u8; length];
        file.read_exact(&mut buf)?;

        Ok(builder
            .status(206)
            .header("Content-Length", length.to_string())
            .header(
                "Content-Range",
                format!("bytes {}-{}/{}", start, end, file_size),
            )
            .body(buf)?)
    } else {
        // No Range: serve first chunk and hint client to use ranges
        let chunk_size = std::cmp::min(file_size, 4 * 1024 * 1024) as usize;
        let mut file = std::fs::File::open(&canonical)?;
        let mut buf = vec![0u8; chunk_size];
        file.read_exact(&mut buf)?;

        if file_size <= chunk_size as u64 {
            Ok(builder
                .status(200)
                .header("Content-Length", file_size.to_string())
                .body(buf)?)
        } else {
            // Return partial with 206 so browser uses Range for the rest
            Ok(builder
                .status(206)
                .header("Content-Length", chunk_size.to_string())
                .header(
                    "Content-Range",
                    format!("bytes 0-{}/{}", chunk_size - 1, file_size),
                )
                .body(buf)?)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .register_asynchronous_uri_scheme_protocol("audiostream", |_ctx, request, responder| {
            // Run the handler off the WebView2 thread so range requests don't
            // serialize on the main thread — critical for M4B files where the
            // browser issues many parallel range requests to locate moov.
            // The panic guard makes sure a panic inside handle_audio_stream
            // never leaves the WebView2 request hanging (which would surface
            // as a stuck/never-loading audio element).
            std::thread::spawn(move || {
                let response = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    handle_audio_stream(request).unwrap_or_else(|_| {
                        tauri::http::Response::builder()
                            .status(500)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(b"Internal server error".to_vec())
                            .unwrap()
                    })
                }))
                .unwrap_or_else(|_| {
                    tauri::http::Response::builder()
                        .status(500)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(b"Internal server error (panic)".to_vec())
                        .unwrap()
                });
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![read_audio_meta])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ==========================================================================
// Tests — synthetic atoms in memory; no real files needed.
// ==========================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    // ---- builders ----

    fn atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut v = ((8 + payload.len()) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(kind);
        v.extend_from_slice(payload);
        v
    }

    /// FullBox: version + 3 flag bytes, then payload.
    fn full_box(kind: &[u8; 4], version: u8, payload: &[u8]) -> Vec<u8> {
        let mut body = vec![version, 0, 0, 0];
        body.extend_from_slice(payload);
        atom(kind, &body)
    }

    fn be32(v: u32) -> [u8; 4] {
        v.to_be_bytes()
    }

    fn concat(parts: &[Vec<u8>]) -> Vec<u8> {
        parts.iter().flatten().copied().collect()
    }

    /// A text sample as stored in a QuickTime chapter track: u16 BE length + bytes.
    fn text_sample(title: &str) -> Vec<u8> {
        let mut v = (title.len() as u16).to_be_bytes().to_vec();
        v.extend_from_slice(title.as_bytes());
        v
    }

    /// Build a `trak` for a chapter text track. `chunk_offsets` are absolute
    /// file offsets; `stsc` entries are (first_chunk, samples_per_chunk, sdi).
    fn chapter_trak(
        timescale: u32,
        durations: &[u32],
        sizes: &[u32],
        chunk_offsets: &[u32],
        stsc: &[(u32, u32, u32)],
    ) -> Vec<u8> {
        // mdhd v0: ctime, mtime, timescale @ byte 12 of data, duration, lang+quality
        let mut mdhd = Vec::new();
        mdhd.extend_from_slice(&[0; 8]);
        mdhd.extend_from_slice(&be32(timescale));
        mdhd.extend_from_slice(&be32(durations.iter().sum()));
        mdhd.extend_from_slice(&[0; 4]);
        let mdhd = full_box(b"mdhd", 0, &mdhd);

        let mut stts = be32(durations.len() as u32).to_vec();
        for d in durations {
            stts.extend_from_slice(&be32(1));
            stts.extend_from_slice(&be32(*d));
        }
        let stts = full_box(b"stts", 0, &stts);

        let mut stsc_p = be32(stsc.len() as u32).to_vec();
        for (fc, spc, sdi) in stsc {
            stsc_p.extend_from_slice(&be32(*fc));
            stsc_p.extend_from_slice(&be32(*spc));
            stsc_p.extend_from_slice(&be32(*sdi));
        }
        let stsc = full_box(b"stsc", 0, &stsc_p);

        let mut stsz = be32(0).to_vec(); // default_size = 0 -> per-sample table
        stsz.extend_from_slice(&be32(sizes.len() as u32));
        for sz in sizes {
            stsz.extend_from_slice(&be32(*sz));
        }
        let stsz = full_box(b"stsz", 0, &stsz);

        let mut stco = be32(chunk_offsets.len() as u32).to_vec();
        for off in chunk_offsets {
            stco.extend_from_slice(&be32(*off));
        }
        let stco = full_box(b"stco", 0, &stco);

        let stbl = atom(b"stbl", &concat(&[stts, stsc, stsz, stco]));
        let minf = atom(b"minf", &stbl);
        let mdia = atom(b"mdia", &concat(&[mdhd, minf]));
        atom(b"trak", &mdia)
    }

    /// File = [trak][samples...]; returns (file bytes, trak_data, trak_end).
    fn chapter_file(
        timescale: u32,
        durations: &[u32],
        titles: &[&str],
        packed_in_one_chunk: bool,
    ) -> (Vec<u8>, u64, u64) {
        let samples: Vec<Vec<u8>> = titles.iter().map(|t| text_sample(t)).collect();
        let sizes: Vec<u32> = samples.iter().map(|s| s.len() as u32).collect();

        // Offsets depend on the trak length, which depends only on entry
        // counts — build once with dummy offsets to measure, then for real.
        let (dummy_offsets, stsc): (Vec<u32>, Vec<(u32, u32, u32)>) = if packed_in_one_chunk {
            (vec![0], vec![(1, titles.len() as u32, 1)])
        } else {
            (vec![0; titles.len()], vec![(1, 1, 1)])
        };
        let trak_len =
            chapter_trak(timescale, durations, &sizes, &dummy_offsets, &stsc).len() as u32;

        let mut offsets = Vec::new();
        let mut pos = trak_len;
        for (i, sz) in sizes.iter().enumerate() {
            if !packed_in_one_chunk || i == 0 {
                offsets.push(pos);
            }
            pos += sz;
        }
        let trak = chapter_trak(timescale, durations, &sizes, &offsets, &stsc);
        let trak_end = trak.len() as u64;
        let file = concat(&[trak, concat(&samples)]);
        (file, 8, trak_end)
    }

    // ---- read_atom_header / find_atom ----

    #[test]
    fn atom_header_standard_size() {
        let data = atom(b"moov", &[0u8; 8]);
        let mut r = Cursor::new(data);
        let (kind, size, hsize) = read_atom_header(&mut r, 0).unwrap();
        assert_eq!(&kind, b"moov");
        assert_eq!(size, 16);
        assert_eq!(hsize, 8);
    }

    #[test]
    fn atom_header_extended_64bit_size() {
        let mut data = be32(1).to_vec();
        data.extend_from_slice(b"mdat");
        data.extend_from_slice(&(32u64).to_be_bytes());
        data.extend_from_slice(&[0u8; 16]);
        let mut r = Cursor::new(data);
        let (kind, size, hsize) = read_atom_header(&mut r, 0).unwrap();
        assert_eq!(&kind, b"mdat");
        assert_eq!(size, 32);
        assert_eq!(hsize, 16);
    }

    #[test]
    fn atom_header_zero_size_extends_to_eof() {
        let mut data = atom(b"ftyp", &[0u8; 4]);
        data.extend_from_slice(&be32(0));
        data.extend_from_slice(b"mdat");
        data.extend_from_slice(&[0u8; 100]);
        let mut r = Cursor::new(data);
        let (kind, size, hsize) = read_atom_header(&mut r, 12).unwrap();
        assert_eq!(&kind, b"mdat");
        assert_eq!(size, 108);
        assert_eq!(hsize, 8);
    }

    #[test]
    fn atom_header_rejects_size_below_header() {
        let mut data = be32(4).to_vec();
        data.extend_from_slice(b"free");
        let mut r = Cursor::new(data);
        assert!(read_atom_header(&mut r, 0).is_none());
    }

    #[test]
    fn find_atom_walks_siblings_and_nested_ranges() {
        let udta = atom(b"udta", &atom(b"chpl", &[0u8; 9]));
        let moov = atom(b"moov", &concat(&[atom(b"mvhd", &[0u8; 4]), udta.clone()]));
        let file = concat(&[atom(b"ftyp", &[0u8; 8]), atom(b"free", &[]), moov.clone()]);
        let mut r = Cursor::new(file.clone());

        let (moov_pos, moov_size) = find_atom(&mut r, 0, file.len() as u64, b"moov").unwrap();
        assert_eq!(moov_pos, 16 + 8);
        assert_eq!(moov_size, moov.len() as u64);

        let moov_data = atom_data_start(&mut r, moov_pos).unwrap();
        let (udta_pos, udta_size) =
            find_atom(&mut r, moov_data, moov_pos + moov_size, b"udta").unwrap();
        assert_eq!(udta_size, udta.len() as u64);
        assert_eq!(udta_pos, moov_data + 12);

        assert!(find_atom(&mut r, 0, file.len() as u64, b"trak").is_none());
    }

    // ---- decode_title ----

    #[test]
    fn decode_title_handles_utf8_and_trailing_nulls() {
        assert_eq!(decode_title(b"Chapter 1\0\0"), "Chapter 1");
        assert_eq!(decode_title("Caf\u{e9}".as_bytes()), "Caf\u{e9}");
        assert_eq!(decode_title(b""), "");
    }

    #[test]
    fn decode_title_handles_utf16_with_bom() {
        let mut be = vec![0xFE, 0xFF];
        for c in "Hi".encode_utf16() {
            be.extend_from_slice(&c.to_be_bytes());
        }
        assert_eq!(decode_title(&be), "Hi");

        // LE with a trailing NUL code unit: the last real byte (0x69) is
        // followed by 0x00 0x00 0x00 — a byte-wise NUL strip would eat the
        // 0x00 high byte of the "i" too and decode "H".
        let mut le = vec![0xFF, 0xFE];
        for c in "Hi".encode_utf16() {
            le.extend_from_slice(&c.to_le_bytes());
        }
        le.extend_from_slice(&[0, 0]);
        assert_eq!(decode_title(&le), "Hi");
    }

    #[test]
    fn decode_title_guesses_utf16_be_without_bom() {
        let mut be = Vec::new();
        for c in "Prologue".encode_utf16() {
            be.extend_from_slice(&c.to_be_bytes());
        }
        assert_eq!(decode_title(&be), "Prologue");
    }

    #[test]
    fn decode_title_falls_back_to_latin1() {
        // 0xE9 alone is invalid UTF-8; Latin-1 maps it to é.
        assert_eq!(decode_title(&[b'C', b'a', b'f', 0xE9]), "Caf\u{e9}");
    }

    // ---- Nero chpl ----

    fn chpl_moov(entries: &[(u64, &str)]) -> Vec<u8> {
        let mut chpl = vec![0u8; 8]; // version 0 + flags + reserved
        chpl.push(entries.len() as u8);
        for (start_100ns, title) in entries {
            chpl.extend_from_slice(&start_100ns.to_be_bytes());
            chpl.push(title.len() as u8);
            chpl.extend_from_slice(title.as_bytes());
        }
        atom(b"moov", &atom(b"udta", &atom(b"chpl", &chpl)))
    }

    #[test]
    fn nero_chapters_parse_timestamps_and_titles() {
        // 100-ns units: 1 s = 10_000_000
        let moov = chpl_moov(&[
            (0, "Intro"),
            (90 * 10_000_000, "Chapter One"),
            (200 * 10_000_000, ""),
        ]);
        let mut r = Cursor::new(moov.clone());
        let chapters = extract_nero_chapters(&mut r, 8, moov.len() as u64, 3_600_000.0);

        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].title, "Intro");
        assert_eq!(chapters[1].title, "Chapter One");
        assert_eq!(chapters[1].start_time_ms, 90_000.0);
        assert_eq!(
            chapters[2].title, "Chapter 3",
            "empty title gets a numbered fallback"
        );
    }

    #[test]
    fn nero_sanity_gate_discards_whole_set_when_any_timestamp_is_impossible() {
        // A stub chpl that parses "cleanly" into a chapter in the far future.
        let far_future = 62_000_000_000u64 * 10_000_000; // ~1965 years
        let moov = chpl_moov(&[(0, "Intro"), (far_future, "Nope")]);
        let mut r = Cursor::new(moov.clone());
        let max_reasonable_ms = 3_600.0 * 1.2 * 1000.0 + 60_000.0; // a 1 h file
        let chapters = extract_nero_chapters(&mut r, 8, moov.len() as u64, max_reasonable_ms);

        assert!(
            chapters.is_empty(),
            "one impossible timestamp invalidates the atom"
        );
    }

    #[test]
    fn nero_returns_empty_without_udta_or_chpl() {
        let moov = atom(b"moov", &atom(b"mvhd", &[0u8; 4]));
        let mut r = Cursor::new(moov.clone());
        assert!(extract_nero_chapters(&mut r, 8, moov.len() as u64, 1e9).is_empty());

        let moov = atom(b"moov", &atom(b"udta", &atom(b"meta", &[0u8; 4])));
        let mut r = Cursor::new(moov.clone());
        assert!(extract_nero_chapters(&mut r, 8, moov.len() as u64, 1e9).is_empty());
    }

    // ---- QuickTime chapter track: stsc resolution ----

    #[test]
    fn chapter_track_one_sample_per_chunk() {
        let titles = ["Intro", "Chapter 1", "Chapter 2"];
        let (file, trak_data, trak_end) =
            chapter_file(1000, &[5_000, 60_000, 90_000], &titles, false);
        let mut r = Cursor::new(file);
        let chapters = extract_chapter_track_data(&mut r, trak_data, trak_end);

        assert_eq!(
            chapters
                .iter()
                .map(|c| c.title.as_str())
                .collect::<Vec<_>>(),
            titles
        );
        assert_eq!(chapters[0].start_time_ms, 0.0);
        assert_eq!(chapters[1].start_time_ms, 5_000.0);
        assert_eq!(chapters[2].start_time_ms, 65_000.0);
    }

    #[test]
    fn chapter_track_many_samples_packed_in_one_chunk() {
        // The v1.1.1 bug: encoders that pack every chapter sample into a single
        // chunk. Assuming one sample per chunk reported only the first chapter.
        let titles = ["Intro", "Chapter 1", "Chapter 2", "Chapter 3"];
        let (file, trak_data, trak_end) = chapter_file(44_100, &[44_100; 4], &titles, true);
        let mut r = Cursor::new(file);
        let chapters = extract_chapter_track_data(&mut r, trak_data, trak_end);

        assert_eq!(
            chapters.len(),
            4,
            "all samples in the chunk must be resolved"
        );
        assert_eq!(
            chapters
                .iter()
                .map(|c| c.title.as_str())
                .collect::<Vec<_>>(),
            titles
        );
        assert_eq!(chapters[3].start_time_ms, 3_000.0);
    }

    #[test]
    fn chapter_track_timescale_converts_to_milliseconds() {
        let titles = ["A", "B"];
        let (file, trak_data, trak_end) = chapter_file(600, &[600 * 30, 600 * 30], &titles, false);
        let mut r = Cursor::new(file);
        let chapters = extract_chapter_track_data(&mut r, trak_data, trak_end);
        assert_eq!(chapters[1].start_time_ms, 30_000.0);
    }

    #[test]
    fn chapter_track_rejects_absurd_stts_entry_count_without_allocating() {
        // stts claiming 2^32-1 entries would be a 32 GB allocation. The guard
        // must bail before that.
        let mut stts = be32(u32::MAX).to_vec();
        stts.extend_from_slice(&[0u8; 8]);
        let stbl = atom(b"stbl", &full_box(b"stts", 0, &stts));
        let mdia = atom(b"mdia", &atom(b"minf", &stbl));
        let trak = atom(b"trak", &mdia);
        let mut r = Cursor::new(trak.clone());
        let chapters = extract_chapter_track_data(&mut r, 8, trak.len() as u64);
        assert!(chapters.is_empty());
    }

    // ---- effective_title ----

    fn ch(title: &str) -> ChapterMeta {
        ChapterMeta {
            title: title.to_string(),
            start_time_ms: 0.0,
        }
    }

    #[test]
    fn title_falls_back_to_album_when_it_equals_the_first_chapter() {
        let t = effective_title(
            Some("Opening Credits".into()),
            Some("Loopbreaker"),
            Some(&ch("opening credits ")),
        );
        assert_eq!(t.as_deref(), Some("Loopbreaker"));
    }

    #[test]
    fn title_is_kept_when_it_differs_from_the_first_chapter() {
        let t = effective_title(
            Some("Dune".into()),
            Some("Dune (Unabridged)"),
            Some(&ch("Book One")),
        );
        assert_eq!(t.as_deref(), Some("Dune"));
    }

    #[test]
    fn title_is_kept_without_album_or_chapters() {
        assert_eq!(
            effective_title(Some("Intro".into()), None, Some(&ch("Intro"))).as_deref(),
            Some("Intro")
        );
        assert_eq!(
            effective_title(Some("Intro".into()), Some("Album"), None).as_deref(),
            Some("Intro")
        );
        assert_eq!(
            effective_title(None, Some("Album"), Some(&ch("Intro"))),
            None
        );
    }

    // ---- parse_range ----

    const MB: u64 = 1024 * 1024;

    #[test]
    fn open_ended_range_is_capped_at_the_chunk_size() {
        assert_eq!(parse_range("bytes=0-", 500 * MB), Some((0, 16 * MB - 1)));
        assert_eq!(
            parse_range("bytes=100-", 500 * MB),
            Some((100, 100 + 16 * MB - 1))
        );
    }

    #[test]
    fn open_ended_range_near_eof_is_clamped_to_the_file() {
        let size = 500 * MB;
        let start = size - 1000;
        assert_eq!(
            parse_range(&format!("bytes={}-", start), size),
            Some((start, size - 1))
        );
    }

    #[test]
    fn explicit_range_is_honoured_and_clamped() {
        assert_eq!(parse_range("bytes=10-20", 100), Some((10, 20)));
        assert_eq!(parse_range("bytes=0-999", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=0-0", 100), Some((0, 0)));
    }

    #[test]
    fn unsatisfiable_ranges_return_none() {
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=200-300", 100), None);
        assert_eq!(parse_range("bytes=50-10", 100), None);
    }

    #[test]
    fn malformed_range_degrades_to_a_capped_prefix() {
        assert_eq!(parse_range("bytes=abc-", 100), Some((0, 99)));
        assert_eq!(parse_range("garbage", 100), Some((0, 99)));
    }

    // ---- ID3v2 CHAP ----

    fn id3_frame(id: &[u8; 4], body: &[u8], version: u8) -> Vec<u8> {
        let mut v = id.to_vec();
        let size = body.len() as u32;
        if version >= 4 {
            v.extend_from_slice(&[
                (size >> 21) as u8 & 0x7F,
                (size >> 14) as u8 & 0x7F,
                (size >> 7) as u8 & 0x7F,
                size as u8 & 0x7F,
            ]);
        } else {
            v.extend_from_slice(&size.to_be_bytes());
        }
        v.extend_from_slice(&[0, 0]);
        v.extend_from_slice(body);
        v
    }

    fn tit2(encoding: u8, text: &[u8], version: u8) -> Vec<u8> {
        let mut b = vec![encoding];
        b.extend_from_slice(text);
        id3_frame(b"TIT2", &b, version)
    }

    fn chap(element: &str, start_ms: u32, sub_frames: &[u8], version: u8) -> Vec<u8> {
        let mut body = element.as_bytes().to_vec();
        body.push(0);
        body.extend_from_slice(&start_ms.to_be_bytes());
        body.extend_from_slice(&u32::MAX.to_be_bytes()); // end time
        body.extend_from_slice(&u32::MAX.to_be_bytes()); // start offset
        body.extend_from_slice(&u32::MAX.to_be_bytes()); // end offset
        body.extend_from_slice(sub_frames);
        id3_frame(b"CHAP", &body, version)
    }

    #[test]
    fn id3v23_chap_frames_in_file_order_come_out_sorted_by_start() {
        let tag = concat(&[
            chap("chp1", 60_000, &tit2(0, b"One", 3), 3),
            chap("chp0", 0, &tit2(3, "Intro".as_bytes(), 3), 3),
            vec![0; 16], // padding
        ]);
        let chapters = id3_chapters_from_tag(&tag, 3, 0);
        let got: Vec<(String, f64)> = chapters
            .iter()
            .map(|c| (c.title.clone(), c.start_time_ms))
            .collect();
        assert_eq!(
            got,
            vec![("Intro".to_string(), 0.0), ("One".to_string(), 60_000.0)]
        );
    }

    #[test]
    fn id3v24_syncsafe_sizes_utf16_titles_and_a_missing_title() {
        let hi = [0xFF, 0xFE, b'H', 0, b'i', 0]; // UTF-16LE with BOM
        let tag = concat(&[
            chap("c0", 0, &tit2(1, &hi, 4), 4),
            chap("c1", 5_000, &[], 4), // no TIT2
            id3_frame(b"TXXX", b"\x03ignored", 4),
        ]);
        let chapters = id3_chapters_from_tag(&tag, 4, 0);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "Hi");
        assert_eq!(chapters[1].title, "Chapter 2");
        assert_eq!(chapters[1].start_time_ms, 5_000.0);
    }

    #[test]
    fn id3v23_whole_tag_unsync_and_extended_header_are_undone() {
        // Latin-1 "A" + 0xFF: the 0xFF picks up a 0x00 under unsynchronisation
        let frames = chap("c", 1_000, &tit2(0, &[b'A', 0xFF], 3), 3);
        let mut ext = 6u32.to_be_bytes().to_vec(); // v2.3: size excludes itself
        ext.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
        let plain = concat(&[ext, frames]);
        let mut unsynced = Vec::new();
        for b in plain {
            unsynced.push(b);
            if b == 0xFF {
                unsynced.push(0);
            }
        }
        let chapters = id3_chapters_from_tag(&unsynced, 3, 0x80 | 0x40);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "A\u{ff}");
        assert_eq!(chapters[0].start_time_ms, 1_000.0);
    }

    #[test]
    fn a_file_without_an_id3_tag_has_no_id3_chapters() {
        assert!(id3_chapters_from_tag(b"not a tag at all", 3, 0).is_empty());
        assert!(id3_chapters_from_tag(&[], 4, 0).is_empty());
    }

    // ---- Sidecars ----

    #[test]
    fn cue_sheet_tracks_become_chapters() {
        let cue = "REM COMMENT x\nTITLE \"The Album\"\nFILE \"b.m4b\" MP4\n  TRACK 01 AUDIO\n    TITLE \"Opening\"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    INDEX 01 01:30:37\n  TRACK 03 AUDIO\n    TITLE \"Three\"\n    INDEX 00 02:00:00\n    INDEX 01 02:00:15\n";
        let got: Vec<(String, f64)> = parse_cue_sheet(cue)
            .iter()
            .map(|c| (c.title.clone(), c.start_time_ms))
            .collect();
        assert_eq!(
            got,
            vec![
                ("Opening".to_string(), 0.0),
                ("Chapter 2".to_string(), 90_493.0), // 1:30 + 37/75 s
                ("Three".to_string(), 120_200.0),
            ]
        );
    }

    #[test]
    fn chapters_txt_lines_become_chapters() {
        let txt = "# comment\n00:00:00.000 Intro\n01:02:03.500 Chapter One\n\n12:34 Short form\nnot a time\n";
        let got: Vec<(String, f64)> = parse_chapters_txt(txt)
            .iter()
            .map(|c| (c.title.clone(), c.start_time_ms))
            .collect();
        assert_eq!(
            got,
            vec![
                ("Intro".to_string(), 0.0),
                ("Chapter One".to_string(), 3_723_500.0),
                ("Short form".to_string(), 754_000.0),
            ]
        );
    }
}
