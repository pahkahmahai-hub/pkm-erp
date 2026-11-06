declare module "pdf-parse" {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
