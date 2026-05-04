const extensionMap = new Map<string, string>([
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["py", "python"],
  ["go", "go"],
  ["java", "java"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["json", "json"],
  ["yml", "yaml"],
  ["yaml", "yaml"],
  ["md", "markdown"],
  ["sql", "sql"],
  ["sh", "shell"],
]);

export function inferLanguageFromPath(filePath: string): string {
  const segments = filePath.split(".");
  if (segments.length < 2) {
    return "text";
  }

  const extension = segments.at(-1)?.toLowerCase();
  if (!extension) {
    return "text";
  }

  return extensionMap.get(extension) ?? extension;
}

