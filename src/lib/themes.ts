export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  primaryFixedDim: string;
  onPrimary: string;
  onPrimaryContainer: string;
  gradientFrom: string;
  gradientTo: string;
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
      primary: "#00595c",
      primaryContainer: "#0d7377",
      primaryFixedDim: "#81d4d8",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#a2f5f9",
      gradientFrom: "#00595c",
      gradientTo: "#0d7377",
    },
    dark: {
      primary: "#4db6ac",
      primaryContainer: "#00796b",
      primaryFixedDim: "#80cbc4",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#b2dfdb",
      gradientFrom: "#3da89e",
      gradientTo: "#4db6ac",
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
      gradientFrom: "#8d6e00",
      gradientTo: "#b8932e",
    },
    dark: {
      primary: "#d4a039",
      primaryContainer: "#b8872e",
      primaryFixedDim: "#ffd485",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#ffe8c0",
      gradientFrom: "#c89430",
      gradientTo: "#d4a039",
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
      gradientFrom: "#3949ab",
      gradientTo: "#5c6bc0",
    },
    dark: {
      primary: "#7986cb",
      primaryContainer: "#3949ab",
      primaryFixedDim: "#9fa8da",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#c5cae9",
      gradientFrom: "#6a79c0",
      gradientTo: "#7986cb",
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
      gradientFrom: "#c62828",
      gradientTo: "#e53935",
    },
    dark: {
      primary: "#ef9a9a",
      primaryContainer: "#c62828",
      primaryFixedDim: "#ef9a9a",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#ffcdd2",
      gradientFrom: "#e08080",
      gradientTo: "#ef9a9a",
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
      gradientFrom: "#2e7d32",
      gradientTo: "#43a047",
    },
    dark: {
      primary: "#81c784",
      primaryContainer: "#2e7d32",
      primaryFixedDim: "#a5d6a7",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#c8e6c9",
      gradientFrom: "#6fbf73",
      gradientTo: "#81c784",
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
      gradientFrom: "#455a64",
      gradientTo: "#607d8b",
    },
    dark: {
      primary: "#90a4ae",
      primaryContainer: "#455a64",
      primaryFixedDim: "#b0bec5",
      onPrimary: "#1a1a1c",
      onPrimaryContainer: "#cfd8dc",
      gradientFrom: "#7e9aa6",
      gradientTo: "#90a4ae",
    },
  },
];
