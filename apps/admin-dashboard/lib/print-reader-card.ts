import QRCode from "qrcode";
import cardArtwork from "../../bonbon-ui-user/public/digital-card-front-art-v1.png";

export type PrintableReaderCard = {
  readerName: string;
  cardUid: string | null;
};

const CONTACT_ADDRESS = [
  "2F, Leftmost Unit, Infront of Salawag Brgy. Hall,",
  "Molino-Paliparan Rd., Brgy. Salawag,",
  "Dasmariñas City, Cavite, Philippines",
];

// Build a separate two-page document so the dashboard never appears in the
// printout. Names and UIDs use textContent and are never interpolated as HTML.
export function buildReaderCardDocument(page: Document, card: PrintableReaderCard, qrDataUrl: string | null = null) {
  page.title = `Library card - ${card.readerName}`;
  page.documentElement.lang = "en";
  const style = page.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    @page { size: 85.6mm 53.98mm; margin: 0; }
    html, body { margin: 0; }
    body { color: #543822; background: #eee7dc; font-family: Arial, sans-serif; }
    .card { position: relative; width: 85.6mm; height: 53.98mm; overflow: hidden;
      background: #fffaf0; break-inside: avoid; page-break-inside: avoid; }
    .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .front-shade { position: absolute; inset: 0; background: linear-gradient(180deg,
      rgba(43,25,12,.58) 0%, rgba(43,25,12,.04) 38%, rgba(43,25,12,.12) 58%, rgba(43,25,12,.82) 100%); }
    .front-content { position: relative; z-index: 2; display: flex; height: 100%;
      flex-direction: column; justify-content: space-between; padding: 4mm; color: white; }
    .brand-lockup { align-self: flex-start; display: flex; align-items: center; gap: 2mm;
      border: .2mm solid rgba(255,255,255,.24); border-radius: 2.5mm;
      background: rgba(64,38,21,.78); padding: 1.7mm 2.2mm; box-shadow: 0 1.2mm 3mm rgba(38,20,10,.24); }
    .brand-seal { display: grid; width: 8mm; height: 8mm; place-items: center;
      border: .25mm solid rgba(249,210,25,.55); border-radius: 2mm; color: #f9d219;
      background: rgba(249,210,25,.1); font: 700 14pt Georgia, serif; }
    .brand { margin: 0; font: 700 9pt Georgia, serif; letter-spacing: .3pt; text-transform: uppercase; }
    .brand-subtitle { margin: .7mm 0 0; color: #f9d219; font-size: 4.2pt;
      font-weight: 700; letter-spacing: .9pt; text-transform: uppercase; }
    .reader-panel { border: .2mm solid rgba(255,255,255,.2); border-radius: 3mm;
      background: rgba(64,38,21,.9); padding: 3mm 3.5mm; box-shadow: 0 1.5mm 4mm rgba(38,20,10,.3); }
    .label { margin: 0; color: #f9d219; font-size: 5pt; font-weight: 800;
      letter-spacing: 1.1pt; text-transform: uppercase; }
    .name { margin: 1.2mm 0 0; color: #fff; font: 700 12pt/1.05 Georgia, serif;
      letter-spacing: .2pt; overflow-wrap: anywhere; text-transform: uppercase; }
    .back { border: .25mm solid rgba(196,128,12,.55); background: #f3d793; }
    .back .art { filter: blur(1.2mm) saturate(.7); opacity: .42; transform: scale(1.07); }
    .back-wash { position: absolute; inset: 0; background: rgba(255,238,184,.58); }
    .back-layout { position: relative; z-index: 2; display: grid; height: 100%;
      grid-template-columns: 31mm minmax(0, 1fr); gap: 2.4mm; padding: 3mm; }
    .panel { min-width: 0; border: .2mm solid rgba(196,128,12,.24); border-radius: 2.6mm;
      background: rgba(255,253,248,.96); box-shadow: 0 .8mm 2.2mm rgba(84,56,34,.09); }
    .qr-panel { display: flex; flex-direction: column; padding: 2mm; text-align: center; }
    .qr-wrap { display: grid; flex: 1; min-height: 0; place-items: center; border-radius: 1.8mm; background: #fff; }
    .qr { display: block; width: 24mm; height: 24mm; object-fit: contain; image-rendering: pixelated; }
    .qr-placeholder { display: grid; width: 24mm; height: 24mm; place-items: center;
      border: .25mm dashed #c4800c; color: #8d6e58; font-size: 6pt; }
    .qr-brand { margin: 1.2mm 0 0; border-top: .2mm solid rgba(196,128,12,.24);
      padding-top: 1.2mm; font: 700 5.3pt Georgia, serif; letter-spacing: .7pt; text-transform: uppercase; }
    .scan-label { margin: .6mm 0 0; color: #a33c12; font-size: 4.2pt; font-weight: 800;
      letter-spacing: .7pt; text-transform: uppercase; }
    .uid { margin: .8mm 0 0; color: #795a42; font: 4.3pt monospace; overflow-wrap: anywhere; }
    .details { display: flex; flex-direction: column; padding: 2.5mm 3mm; }
    .details-title { margin: 0; border-bottom: .2mm solid rgba(196,128,12,.28);
      padding-bottom: 1.5mm; font-size: 6pt; font-weight: 800; letter-spacing: .75pt; text-transform: uppercase; }
    .rules { margin: 2mm 0 0; padding-left: 3.2mm; color: #654a36; font-size: 4.5pt; line-height: 1.4; }
    .rules li + li { margin-top: 1mm; }
    .contact { margin-top: auto; border-top: .2mm solid rgba(196,128,12,.28);
      padding-top: 1.5mm; color: #806b59; font-size: 4.1pt; line-height: 1.42; }
    .contact strong { display: block; margin-bottom: .5mm; color: #654a36; }
    .instructions { max-width: 180mm; margin: 5mm 0; font-size: 10pt; line-height: 1.5; }
    @media screen {
      body { display: grid; gap: 7mm; justify-content: center; padding: 8mm; }
      .card { border-radius: 3mm; box-shadow: 0 3mm 8mm #32221622; }
    }
    @media print {
      body { background: white; }
      .card { page-break-after: always; }
      .card:last-of-type { page-break-after: auto; }
      .instructions { display: none; }
    }
  `;
  page.head.append(style);

  const element = (tag: string, className: string, text?: string) => {
    const node = page.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const artwork = () => {
    const image = page.createElement("img");
    image.className = "art";
    image.alt = "";
    image.src = cardArtwork.src;
    return image;
  };

  const front = element("article", "card front");
  front.setAttribute("aria-label", "Printable library card front");
  const frontContent = element("div", "front-content");
  const brandLockup = element("div", "brand-lockup");
  const brandCopy = element("div", "");
  brandCopy.append(element("p", "brand", "Tankobonbon"), element("p", "brand-subtitle", "Reader card"));
  brandLockup.append(element("span", "brand-seal", "⌑"), brandCopy);
  const readerPanel = element("div", "reader-panel");
  readerPanel.append(element("p", "label", "Reader"), element("h1", "name", card.readerName));
  frontContent.append(brandLockup, readerPanel);
  front.append(artwork(), element("div", "front-shade"), frontContent);

  const back = element("article", "card back");
  back.setAttribute("aria-label", "Printable library card back");
  const backLayout = element("div", "back-layout");
  const qrPanel = element("section", "panel qr-panel");
  const qrWrap = element("div", "qr-wrap");
  if (qrDataUrl) {
    const qrImage = page.createElement("img");
    qrImage.className = "qr";
    qrImage.alt = "Kiosk login QR code";
    qrImage.src = qrDataUrl;
    qrWrap.append(qrImage);
  } else {
    qrWrap.append(element("div", "qr-placeholder", "RFID card required"));
  }
  qrPanel.append(
    qrWrap,
    element("p", "qr-brand", "Tankobonbon"),
    element("p", "scan-label", qrDataUrl ? "Scan to log in" : "Link card to enable QR"),
    element("p", "uid", card.cardUid ? `RFID UID: ${card.cardUid}` : "RFID UID: awaiting card link"),
  );

  const details = element("section", "panel details");
  details.append(element("p", "details-title", "Library reader card"));
  const rules = element("ul", "rules");
  [
    "This card is for the registered reader only and is non-transferable.",
    "Present this card when entering and using the library.",
    "Topped-up credits are non-refundable and follow current library rules.",
    "Return or report this card to library staff if it is lost.",
  ].forEach(rule => rules.append(element("li", "", rule)));
  const contact = element("div", "contact");
  contact.append(element("strong", "", "tankobonbon.com · library@tankobonbon.com"));
  CONTACT_ADDRESS.forEach(line => contact.append(element("div", "", line)));
  details.append(rules, contact);
  backLayout.append(qrPanel, details);
  back.append(artwork(), element("div", "back-wash"), backLayout);

  page.body.replaceChildren(
    front,
    back,
    element("p", "instructions", "Print at actual size (100%) on 85.6 × 53.98 mm cards. Print both pages using your card printer's duplex setting, and turn off browser headers and footers."),
  );
}

function waitForImages(page: Document) {
  return Promise.all(Array.from(page.images, image => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

export async function printReaderCard(card: PrintableReaderCard) {
  // Open synchronously so browser popup protection treats it as user-initiated.
  const popup = window.open("", "_blank", "width=780,height=760");
  if (!popup) throw new Error("Allow pop-ups for this site, then choose Print again.");
  try {
    const qrDataUrl = card.cardUid
      ? await QRCode.toDataURL(card.cardUid, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 512,
        color: { dark: "#321b0d", light: "#ffffff" },
      })
      : null;
    buildReaderCardDocument(popup.document, card, qrDataUrl);
    await waitForImages(popup.document);
    popup.addEventListener("afterprint", () => popup.close(), { once: true });
    popup.focus();
    popup.print();
  } catch (cause) {
    popup.close();
    throw cause;
  }
}
