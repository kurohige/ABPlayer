export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  primaryFixedDim: string;
  onPrimary: string;
  onPrimaryContainer: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "teal",
    name: "Teal",
    light: {
      primary: "#00696b",
      primaryContainer: "#0d7377",
      primaryFixedDim: "#81d4d8",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#a2f5f9",
    },
    dark: {
      primary: "#4db6ac",
      primaryContainer: "#00796b",
      primaryFixedDim: "#80cbc4",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#b2dfdb",
    },
  },
  {
    id: "gold",
    name: "Gold",
    light: {
      primary: "#8d6e00",
      primaryContainer: "#b8932e",
      primaryFixedDim: "#ffd485",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#ffe8c0",
    },
    dark: {
      primary: "#d4a039",
      primaryContainer: "#b8872e",
      primaryFixedDim: "#ffd485",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#ffe8c0",
    },
  },
  {
    id: "indigo",
    name: "Indigo",
    light: {
      primary: "#3949ab",
      primaryContainer: "#5c6bc0",
      primaryFixedDim: "#9fa8da",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#c5cae9",
    },
    dark: {
      primary: "#7986cb",
      primaryContainer: "#3949ab",
      primaryFixedDim: "#9fa8da",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#c5cae9",
    },
  },
  {
    id: "rose",
    name: "Rose",
    light: {
      primary: "#c62828",
      primaryContainer: "#e53935",
      primaryFixedDim: "#ef9a9a",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#ffcdd2",
    },
    dark: {
      primary: "#ef9a9a",
      primaryContainer: "#c62828",
      primaryFixedDim: "#ef9a9a",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#ffcdd2",
    },
  },
  {
    id: "forest",
    name: "Forest",
    light: {
      primary: "#2e7d32",
      primaryContainer: "#43a047",
      primaryFixedDim: "#a5d6a7",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#c8e6c9",
    },
    dark: {
      primary: "#81c784",
      primaryContainer: "#2e7d32",
      primaryFixedDim: "#a5d6a7",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#c8e6c9",
    },
  },
  {
    id: "slate",
    name: "Slate",
    light: {
      primary: "#455a64",
      primaryContainer: "#607d8b",
      primaryFixedDim: "#b0bec5",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#cfd8dc",
    },
    dark: {
      primary: "#90a4ae",
      primaryContainer: "#455a64",
      primaryFixedDim: "#b0bec5",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#cfd8dc",
    },
  },
];
