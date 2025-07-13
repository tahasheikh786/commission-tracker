declare module 'pdf-parse' {
  function pdfParse(buffer: Buffer): Promise<{ text: string }>;
  export default pdfParse;
}

declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: any };
  }
  export interface Utils {
    sheet_to_json(sheet: any): any[];
  }
  export const read: (buffer: Buffer, opts: { type: string }) => WorkBook;
  export const utils: Utils;
} 