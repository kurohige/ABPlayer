use base64::Engine;
use log::warn;
use lofty::config::ParseOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Maximum allocation size for chapter data from untrusted files (16 MB).
const MAX_CHAPTER_ALLOC: usize = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct AudioMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_secs: f64,
    pub cover_art: Option<String>,
    pub chapters: Vec<ChapterMeta>,
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

    // Check for UTF-16 BOM
    if raw.len() >= 2 {
        if raw[0] == 0xFE && raw[1] == 0xFF {
            // UTF-16 BE with BOM
            return decode_utf16_be(&raw[2..]);
        }
        if raw[0] == 0xFF && raw[1] == 0xFE {
            // UTF-16 LE with BOM
            return decode_utf16_le(&raw[2..]);
        }
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

fn extract_nero_chapters(reader: &mut (impl Read + Seek), moov_start: u64, moov_end: u64) -> Vec<ChapterMeta> {
    let udta = match find_atom(reader, moov_start, moov_end, b"udta") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let udta_data = match atom_data_start(reader, udta.0) {
        Some(s) => s,
        None => return Vec::new(),
    };

    let chpl = match find_atom(reader, udta_data, udta.0 + udta.1, b"chpl") {
        Some(v) => v,
        None => return Vec::new(),
    };
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

    let version = data[0];
    let mut offset = 8;

    let count = if version == 1 {
        if data.len() < offset + 4 { return Vec::new(); }
        let c = read_u32(&data[offset..offset + 4]) as usize;
        offset += 4;
        c
    } else {
        if data.len() < offset + 1 { return Vec::new(); }
        let c = data[offset] as usize;
        offset += 1;
        c
    };

    let mut chapters = Vec::with_capacity(count);
    for i in 0..count {
        if offset + 9 > data.len() { break; }

        let start_100ns = read_u64(&data[offset..offset + 8]);
        offset += 8;

        let title_len = data[offset] as usize;
        offset += 1;

        let title = if offset + title_len <= data.len() {
            let raw = &data[offset..offset + title_len];
            offset += title_len;
            let decoded = decode_title(raw);
            if decoded.trim().is_empty() { format!("Chapter {}", i + 1) } else { decoded }
        } else {
            format!("Chapter {}", i + 1)
        };

        let start_ms = (start_100ns as f64) / 10_000.0;
        chapters.push(ChapterMeta { title, start_time_ms: start_ms });
    }

    chapters
}

// ---- QuickTime Chapter Track ----

fn extract_qt_chapters(reader: &mut (impl Read + Seek), moov_start: u64, moov_end: u64) -> Vec<ChapterMeta> {
    let traks = find_all_atoms(reader, moov_start, moov_end, b"trak");
    if traks.is_empty() {
        return Vec::new();
    }

    // Find which trak has a tref/chap pointing to a chapter track
    let mut chapter_track_id: Option<u32> = None;
    for &(trak_pos, trak_size) in &traks {
        let trak_data = match atom_data_start(reader, trak_pos) { Some(s) => s, None => continue };
        let trak_end = trak_pos + trak_size;

        if let Some((tref_pos, tref_size)) = find_atom(reader, trak_data, trak_end, b"tref") {
            let tref_data = match atom_data_start(reader, tref_pos) { Some(s) => s, None => continue };
            if let Some((chap_pos, chap_size)) = find_atom(reader, tref_data, tref_pos + tref_size, b"chap") {
                let chap_data = match atom_data_start(reader, chap_pos) { Some(s) => s, None => continue };
                if chap_size >= 12 {
                    let mut id_buf = [0u8; 4];
                    if reader.seek(SeekFrom::Start(chap_data)).is_ok() && reader.read_exact(&mut id_buf).is_ok() {
                        chapter_track_id = Some(read_u32(&id_buf));
                    }
                }
            }
        }
    }

    let chapter_track_id = match chapter_track_id {
        Some(id) => id,
        None => return Vec::new(),
    };

    // Find the trak with matching track ID
    for &(trak_pos, trak_size) in &traks {
        let trak_data = match atom_data_start(reader, trak_pos) { Some(s) => s, None => continue };
        let trak_end = trak_pos + trak_size;

        if let Some((tkhd_pos, _tkhd_size)) = find_atom(reader, trak_data, trak_end, b"tkhd") {
            let tkhd_data = match atom_data_start(reader, tkhd_pos) { Some(s) => s, None => continue };
            let mut tkhd_buf = [0u8; 24];
            if reader.seek(SeekFrom::Start(tkhd_data)).is_err() || reader.read_exact(&mut tkhd_buf).is_err() {
                continue;
            }
            let version = tkhd_buf[0];
            let track_id = if version == 0 {
                read_u32(&tkhd_buf[12..16])
            } else {
                read_u32(&tkhd_buf[20..24])
            };

            if track_id == chapter_track_id {
                return extract_chapter_track_data(reader, trak_data, trak_end);
            }
        }
    }

    Vec::new()
}

fn extract_chapter_track_data(
    reader: &mut (impl Read + Seek),
    trak_data: u64,
    trak_end: u64,
) -> Vec<ChapterMeta> {
    let mdia = match find_atom(reader, trak_data, trak_end, b"mdia") { Some(v) => v, None => return Vec::new() };
    let mdia_data = match atom_data_start(reader, mdia.0) { Some(s) => s, None => return Vec::new() };
    let mdia_end = mdia.0 + mdia.1;

    // Get timescale from mdhd
    let mut timescale: u32 = 1000;
    if let Some((mdhd_pos, _)) = find_atom(reader, mdia_data, mdia_end, b"mdhd") {
        let mdhd_data = match atom_data_start(reader, mdhd_pos) { Some(s) => s, None => 0 };
        if mdhd_data > 0 {
            let mut buf = [0u8; 24];
            if reader.seek(SeekFrom::Start(mdhd_data)).is_ok() && reader.read_exact(&mut buf).is_ok() {
                let version = buf[0];
                timescale = if version == 0 { read_u32(&buf[12..16]) } else { read_u32(&buf[20..24]) };
                if timescale == 0 { timescale = 1000; }
            }
        }
    }

    let minf = match find_atom(reader, mdia_data, mdia_end, b"minf") { Some(v) => v, None => return Vec::new() };
    let minf_data = match atom_data_start(reader, minf.0) { Some(s) => s, None => return Vec::new() };
    let stbl = match find_atom(reader, minf_data, minf.0 + minf.1, b"stbl") { Some(v) => v, None => return Vec::new() };
    let stbl_data = match atom_data_start(reader, stbl.0) { Some(s) => s, None => return Vec::new() };
    let stbl_end = stbl.0 + stbl.1;

    // stts: sample durations
    let mut durations: Vec<u64> = Vec::new();
    if let Some((stts_pos, _)) = find_atom(reader, stbl_data, stbl_end, b"stts") {
        let stts_data = match atom_data_start(reader, stts_pos) { Some(s) => s, None => 0 };
        if stts_data > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(stts_data)).is_ok() && reader.read_exact(&mut header).is_ok() {
                let entry_count = read_u32(&header[4..8]) as usize;
                let alloc_size = entry_count.saturating_mul(8);
                if alloc_size > MAX_CHAPTER_ALLOC { return Vec::new(); }
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
        let data_start = match atom_data_start(reader, stco_pos) { Some(s) => s, None => 0 };
        if data_start > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(data_start)).is_ok() && reader.read_exact(&mut header).is_ok() {
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
        let data_start = match atom_data_start(reader, co64_pos) { Some(s) => s, None => 0 };
        if data_start > 0 {
            let mut header = [0u8; 8];
            if reader.seek(SeekFrom::Start(data_start)).is_ok() && reader.read_exact(&mut header).is_ok() {
                let count = read_u32(&header[4..8]) as usize;
                let alloc_size = count.saturating_mul(8);
                if alloc_size > MAX_CHAPTER_ALLOC { return Vec::new(); }
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
        let data_start = match atom_data_start(reader, stsz_pos) { Some(s) => s, None => 0 };
        if data_start > 0 {
            let mut header = [0u8; 12];
            if reader.seek(SeekFrom::Start(data_start)).is_ok() && reader.read_exact(&mut header).is_ok() {
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

    // Read chapter titles
    let mut chapters = Vec::new();
    let mut current_time: u64 = 0;
    let count = chunk_offsets.len().min(sample_sizes.len());

    for i in 0..count {
        let offset = chunk_offsets[i];
        let size = sample_sizes[i] as usize;
        let start_ms = (current_time as f64 / timescale as f64) * 1000.0;

        // MP4 text sample: 2-byte BE length prefix, then text bytes
        let read_size = size.min(1024);
        let mut buf = vec![0u8; read_size];
        let title = if reader.seek(SeekFrom::Start(offset)).is_ok() && reader.read_exact(&mut buf).is_ok() && buf.len() >= 2 {
            let text_len = read_u16(&buf[0..2]) as usize;
            let end = (2 + text_len).min(buf.len());
            let decoded = decode_title(&buf[2..end]);
            if decoded.trim().is_empty() { format!("Chapter {}", i + 1) } else { decoded }
        } else {
            format!("Chapter {}", i + 1)
        };

        chapters.push(ChapterMeta { title, start_time_ms: start_ms });

        if i < durations.len() {
            current_time += durations[i];
        }
    }

    chapters
}

// ---- Main Entry ----

fn is_mp4_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("m4b" | "m4a" | "mp4")
    )
}

fn extract_mp4_chapters(file_path: &Path) -> Vec<ChapterMeta> {
    let mut file = match std::fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let file_size = match file.seek(SeekFrom::End(0)) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let _ = file.seek(SeekFrom::Start(0));

    let (moov_pos, moov_size) = match find_atom(&mut file, 0, file_size, b"moov") {
        Some(v) => v,
        None => return Vec::new(),
    };

    let moov_data = match atom_data_start(&mut file, moov_pos) {
        Some(s) => s,
        None => return Vec::new(),
    };
    let moov_end = moov_pos + moov_size;

    // Try QuickTime chapters first (more structured, more common in Apple M4B)
    let chapters = extract_qt_chapters(&mut file, moov_data, moov_end);
    if !chapters.is_empty() {
        return chapters;
    }

    // Fallback to Nero chapters
    extract_nero_chapters(&mut file, moov_data, moov_end)
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

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

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
                let mime = pic.mime_type().map(|m| m.to_string()).unwrap_or_else(|| "image/jpeg".to_string());
                let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
                format!("data:{};base64,{}", mime, b64)
            });

        (title, artist, album, cover_art)
    } else {
        (None, None, None, None)
    };

    let chapters = if is_mp4_file(path) {
        extract_mp4_chapters(path)
    } else {
        Vec::new()
    };

    Ok(AudioMeta {
        title,
        artist,
        album,
        duration_secs,
        cover_art,
        chapters,
    })
}

// ---- Audio streaming protocol with CORS headers ----

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
        let range_str = range.strip_prefix("bytes=").unwrap_or(&range);
        let parts: Vec<&str> = range_str.splitn(2, '-').collect();
        let start: u64 = parts[0].parse().unwrap_or(0);
        let end: u64 = if parts.len() > 1 && !parts[1].is_empty() {
            parts[1].parse().unwrap_or(file_size.saturating_sub(1))
        } else {
            std::cmp::min(start + 2 * 1024 * 1024 - 1, file_size.saturating_sub(1))
        };

        // Validate range
        if start >= file_size || end < start {
            return Ok(tauri::http::Response::builder()
                .status(416)
                .header("Access-Control-Allow-Origin", "*")
                .header("Content-Range", format!("bytes */{}", file_size))
                .body(Vec::new())?);
        }
        let end = std::cmp::min(end, file_size - 1);
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
        .register_uri_scheme_protocol("audiostream", |_ctx, request| {
            handle_audio_stream(request).unwrap_or_else(|_| {
                tauri::http::Response::builder()
                    .status(500)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(b"Internal server error".to_vec())
                    .unwrap()
            })
        })
        .invoke_handler(tauri::generate_handler![read_audio_meta])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
