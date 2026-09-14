"use client";

import { useMemo, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor, Position } from "monaco-editor";
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkspaceFile = {
  path: string;
  name: string;
  size: number;
  extension: string;
  editable: boolean;
};

type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  file?: WorkspaceFile;
  children: FileNode[];
};

type CodeWorkspaceEditorProps = {
  content: string;
  files: WorkspaceFile[];
  itemName: string;
  rootLabel: string;
  saving: boolean;
  selectedFile: string;
  setContent: (content: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSelectFile: (path: string) => void;
  labels: {
    close: string;
    createFile: string;
    noEditableFile: string;
    noFiles: string;
    save: string;
    uploadFile: string;
  };
};

const macroSuggestions = [
  ["{offer}", "Offer URL for this campaign flow"],
  ["{{offer}}", "Offer URL for this campaign flow"],
  ["{subid}", "Current click id"],
  ["{click_id}", "Current click id"],
  ["{campaign_id}", "Current campaign id"],
];

export function CodeWorkspaceEditor({
  content,
  files,
  itemName,
  rootLabel,
  saving,
  selectedFile,
  setContent,
  onClose,
  onSave,
  onSelectFile,
  labels,
}: CodeWorkspaceEditorProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const defaultExpanded = useMemo(() => defaultExpandedFolders(files, selectedFile), [files, selectedFile]);
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);
  const expandedFolders = useMemo(() => new Set([...expanded, ...defaultExpanded]), [defaultExpanded, expanded]);

  const selected = files.find((file) => file.path === selectedFile);

  return (
    <div className="fixed inset-0 z-50 bg-[#1f1f1f] text-neutral-100">
      <div className="flex h-12 items-center justify-between border-b border-neutral-800 bg-[#181818] px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            {labels.createFile}
          </Button>
          <Button variant="outline" size="sm" disabled>
            {labels.uploadFile}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button className="bg-[#45b84a] text-white hover:bg-[#3da442]" disabled={saving || !selectedFile} onClick={onSave}>
            <Save className="size-4" />
            {labels.save}
          </Button>
          <Button aria-label={labels.close} variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid h-[calc(100vh-48px)] grid-cols-[300px_1fr]">
        <aside className="min-w-0 border-r border-neutral-800 bg-[#181818]">
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="truncate text-sm font-semibold">{itemName}</div>
            <div className="truncate text-xs text-neutral-400">{rootLabel}</div>
          </div>
          <div className="h-[calc(100vh-105px)] overflow-auto py-2">
            {tree.length === 0 ? (
              <div className="px-4 py-6 text-sm text-neutral-400">{labels.noFiles}</div>
            ) : (
              tree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  expanded={expanded}
                  expandedFolders={expandedFolders}
                  node={node}
                  selectedFile={selectedFile}
                  setExpanded={setExpanded}
                  onSelectFile={onSelectFile}
                />
              ))
            )}
          </div>
        </aside>
        <section className="flex min-w-0 flex-col bg-[#1f1f1f]">
          <div className="flex h-10 items-center gap-2 border-b border-neutral-800 bg-[#181818] px-4 text-xs text-neutral-400">
            <span className="truncate">{itemName}</span>
            <span>/</span>
            <span className="truncate font-medium text-neutral-100">{selectedFile || labels.noEditableFile}</span>
            {selected ? <span className="ml-auto text-neutral-500">{formatSize(selected.size)}</span> : null}
          </div>
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              language={languageForFile(selectedFile)}
              path={selectedFile || "empty.txt"}
              theme="vs-dark"
              value={selectedFile ? content : ""}
              beforeMount={setupMonaco}
              options={{
                autoClosingBrackets: "always",
                autoClosingDelete: "always",
                autoClosingOvertype: "always",
                autoClosingQuotes: "always",
                automaticLayout: true,
                bracketPairColorization: { enabled: true },
                cursorBlinking: "smooth",
                detectIndentation: true,
                folding: true,
                fontFamily:
                  "Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 13,
                formatOnPaste: true,
                formatOnType: true,
                minimap: { enabled: true },
                readOnly: !selectedFile,
                renderWhitespace: "selection",
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                tabCompletion: "on",
                wordWrap: "on",
              }}
              onChange={(value) => setContent(value ?? "")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function FileTreeNode({
  expanded,
  expandedFolders,
  node,
  selectedFile,
  setExpanded,
  onSelectFile,
  depth = 0,
}: {
  expanded: Set<string>;
  expandedFolders: Set<string>;
  node: FileNode;
  selectedFile: string;
  setExpanded: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
}) {
  const isOpen = expandedFolders.has(node.path);
  if (node.type === "folder") {
    return (
      <div>
        <button
          className="flex h-7 w-full items-center gap-1.5 truncate px-2 text-left text-xs text-neutral-300 hover:bg-neutral-800"
          style={{ paddingLeft: 8 + depth * 14 }}
          type="button"
          onClick={() =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(node.path)) {
                next.delete(node.path);
              } else {
                next.add(node.path);
              }
              return next;
            })
          }
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {isOpen ? <FolderOpen className="size-4 text-blue-300" /> : <Folder className="size-4 text-blue-300" />}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                depth={depth + 1}
                expanded={expanded}
                expandedFolders={expandedFolders}
                node={child}
                selectedFile={selectedFile}
                setExpanded={setExpanded}
                onSelectFile={onSelectFile}
              />
            ))
          : null}
      </div>
    );
  }

  const isSelected = selectedFile === node.path;
  const editable = node.file?.editable ?? false;
  return (
    <button
      className={[
        "flex h-7 w-full items-center gap-2 truncate px-2 text-left text-xs",
        isSelected ? "bg-[#04395e] text-white" : "text-neutral-300 hover:bg-neutral-800",
        !editable ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      disabled={!editable}
      style={{ paddingLeft: 12 + depth * 14 }}
      type="button"
      onClick={() => onSelectFile(node.path)}
    >
      {codeFileExtensions.has(node.file?.extension.toLowerCase() ?? "") ? (
        <FileCode2 className="size-4 text-emerald-300" />
      ) : (
        <FileText className="size-4 text-neutral-400" />
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {node.file ? <span className="text-[10px] text-neutral-500">{formatSize(node.file.size)}</span> : null}
    </button>
  );
}

function buildFileTree(files: WorkspaceFile[]) {
  const root: FileNode[] = [];

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split("/").filter(Boolean);
    let siblings = root;
    let path = "";

    parts.forEach((part, index) => {
      path = path ? `${path}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = siblings.find((item) => item.name === part && item.type === (isFile ? "file" : "folder"));
      if (!node) {
        node = {
          name: part,
          path,
          type: isFile ? "file" : "folder",
          file: isFile ? file : undefined,
          children: [],
        };
        siblings.push(node);
        siblings.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      }
      siblings = node.children;
    });
  }

  return root;
}

function defaultExpandedFolders(files: WorkspaceFile[], selectedFile: string) {
  const expanded = new Set<string>();
  const paths = selectedFile ? [selectedFile] : files.map((file) => file.path);
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}/${parts[index]}` : parts[index];
      expanded.add(current);
    }
  }
  return expanded;
}

function setupMonaco(monaco: Monaco) {
  const languages = ["html", "javascript", "typescript", "css", "json", "php", "plaintext"];
  for (const language of languages) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ["{", "."],
      provideCompletionItems: (model: editor.ITextModel, position: Position) => ({
        suggestions: macroSuggestions.map(([macro, detail]) => ({
          label: macro,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: macro,
          detail,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: model.getWordUntilPosition(position).startColumn,
            endColumn: position.column,
          },
        })),
      }),
    });
  }
}

function languageForFile(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "css":
      return "css";
    case "json":
      return "json";
    case "php":
      return "php";
    default:
      return "plaintext";
  }
}

const codeFileExtensions = new Set(["html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "json", "php", "txt", "md"]);

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${Math.round(size / 1024 / 1024)} MB`;
}
