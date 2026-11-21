// File access that works in the browser and inside the Tauri desktop shell.
export const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface OpenedFile {
  name: string;
  text: string;
  path?: string;
}

export async function openTextFile(extensions: string[]): Promise<OpenedFile | null> {
  if (isDesktop()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ multiple: false, filters: [{ name: extensions.join(", "), extensions }] });
    if (!path || Array.isArray(path)) return null;
    return { name: path.split(/[\\/]/).pop() ?? path, text: await readTextFile(path), path };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((e) => "." + e).join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Returns the name the file was saved under, or null when cancelled. */
export async function saveFile(suggestedName: string, data: string | Blob, mime: string): Promise<string | null> {
  const ext = suggestedName.split(".").pop() ?? "";
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    if (typeof data === "string") await writeTextFile(path, data);
    else await writeFile(path, new Uint8Array(await data.arrayBuffer()));
    return path.split(/[\\/]/).pop() ?? path;
  }
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName, types: [{ description: ext.toUpperCase(), accept: { [mime]: ["." + ext] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return null;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}
