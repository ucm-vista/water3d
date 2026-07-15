import type { FieldConfig } from "../types/domain";

// New users start with no fields. The setup flow (FieldManager → SetupPanel)
// walks them through creating their first field from a map pin.
export const defaultFields: FieldConfig[] = [];
