export interface ReviewOutput {
  summary: string;
  overall_risk: "low" | "medium" | "high";
  comments: ReviewComment[];
}

export interface ReviewComment {
  file_path: string;
  line_number: number;
  severity: "critical" | "warning" | "suggestion";
  category: "security" | "correctness" | "architecture" | "performance" | "style";
  title: string;
  explanation: string;
  suggested_fix?: string;
  references_similar_pattern?: string;
  confidence: number;
}

export interface FileDiff {
  filename: string;
  language: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  newLineNumber?: number;
  oldLineNumber?: number;
}

