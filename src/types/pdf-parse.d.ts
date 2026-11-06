declare module "pdf-parse" {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
