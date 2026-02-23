
export interface PromptEntry {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  image?: string; // Base64 thumbnail
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  parentId?: string; // Optional parent category ID for nesting
}

export enum ViewMode {
  MANAGE = 'MANAGE',
  PYTHON_EXPORT = 'PYTHON_EXPORT'
}

export enum SortOption {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  TITLE_ASC = 'TITLE_ASC',
  TITLE_DESC = 'TITLE_DESC'
}
