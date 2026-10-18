// Browser-only document text extraction. Call from event handlers only.
export const ACCEPTED_EXT = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".md"];

export async function extractText(file: Blob, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (ext === ".txt" || ext === ".md" || ext === ".csv") return await file.text();

  if (ext === ".pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return pages.join("\n\n");
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return res.value;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((n) => `# Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n]!)).join("\n\n");
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
