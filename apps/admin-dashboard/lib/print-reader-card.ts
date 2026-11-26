export type PrintableReaderCard = {
  readerName: string;
  readerId: string;
  membership: string;
  cardUid: string | null;
};

// Build a separate document so the dashboard never appears in the printout.
// User-supplied names are assigned with textContent, never interpolated as HTML.
export function buildReaderCardDocument(page: Document, card: PrintableReaderCard) {
  page.title = `RFID card - ${card.readerName}`;
  page.documentElement.lang = "en";
  const style = page.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    @page { size: 85.6mm 53.98mm; margin: 0; }
    body { margin: 0; color: #322216; background: #eee7dc; font-family: Arial, sans-serif; }
    .card { width: 85.6mm; height: 53.98mm; padding: 4mm; overflow: hidden;
      background: #fffaf0; border: .3mm solid #c4800c; position: relative;
      display: flex; flex-direction: column; break-inside: avoid; }
    .brand { font-size: 15pt; font-weight: 800; letter-spacing: -.4pt; margin: 0; }
    .subtitle { font-size: 6.5pt; letter-spacing: 1.2pt; text-transform: uppercase; margin: 1mm 0 0; }
    .label { font-size: 6pt; text-transform: uppercase; letter-spacing: .8pt; margin: 0 0 1mm; color: #795a42; }
    .reader { margin-top: auto; padding-top: 2mm; }
    .name { font-size: 12pt; line-height: 1.1; overflow-wrap: anywhere; margin: 0; }
    .membership { font-size: 8pt; margin: 1mm 0 2mm; }
    .identifier { font: 6.5pt monospace; overflow-wrap: anywhere; margin: 0; }
    .footer { border-top: .2mm solid #d8c3ad; margin-top: 2mm; padding-top: 1.5mm;
      display: flex; justify-content: space-between; font-size: 5.5pt; }
    .instructions { max-width: 85.6mm; margin: 5mm 0; font-size: 10pt; line-height: 1.5; }
    @media screen { body { padding: 8mm; } .card { border-radius: 3mm; box-shadow: 0 3mm 8mm #32221622; } }
    @media print { .instructions { display: none; } }
  `;
  page.head.append(style);
  const element = (tag: string, className: string, text?: string) => {
    const node = page.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const front = element("article", "card");
  front.setAttribute("aria-label", "Printable RFID reader card");
  const header = element("header", "");
  header.append(element("p", "brand", "Tankobonbon"), element("p", "subtitle", "Manga library · RFID reader card"));
  const reader = element("div", "reader");
  reader.append(element("p", "label", "Reader"), element("h1", "name", card.readerName), element("p", "membership", card.membership));
  reader.append(element("p", "identifier", `Reader ID: ${card.readerId}`));
  reader.append(element("p", "identifier", card.cardUid ? `RFID UID: ${card.cardUid}` : "RFID UID: awaiting card link"));
  const footer = element("footer", "footer");
  footer.append(element("span", "", "For the registered reader only"), element("span", "", "tankobonbon.com"));
  front.append(header, reader, footer);
  page.body.replaceChildren(front, element("p", "instructions", "Print at actual size (100%) on an 85.6 × 53.98 mm card. Turn off browser headers and footers. Choose your card printer in the print dialog."));
}

export function printReaderCard(card: PrintableReaderCard) {
  const popup = window.open("", "_blank", "width=650,height=500");
  if (!popup) throw new Error("Allow pop-ups for this site, then choose Print again.");
  try {
    buildReaderCardDocument(popup.document, card);
    popup.addEventListener("afterprint", () => popup.close(), { once: true });
    popup.focus();
    popup.print();
  } catch (cause) {
    popup.close();
    throw cause;
  }
}
