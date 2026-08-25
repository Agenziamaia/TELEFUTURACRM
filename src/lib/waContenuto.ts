// CONTENUTO DI UN MESSAGGIO WHATSAPP (Evolution/Baileys) — regola UNICA per
// webhook e sync/history (revisore 25/08: il guard «niente testo e niente
// media» scartava anche contatti vCard, posizioni, foto «visualizza una
// volta» e PDF con didascalia — messaggi VERI dei clienti spariti nel nulla,
// e una risposta data dal telefono con una posizione non spegneva l'alert).
// 1) si SVOLGONO i contenitori (effimeri, view-once, documento+didascalia);
// 2) testo/didascalia, oppure un'etichetta leggibile per i tipi speciali;
// 3) resta senza corpo E senza mime SOLO la roba di servizio (reazioni,
//    protocolMessage, voti dei sondaggi…) → il chiamante la scarta.

type MsgWA = Record<string, any>;

export function svolgiMessaggio(msgIn: MsgWA | null | undefined): MsgWA {
    let msg: MsgWA = msgIn || {};
    for (let i = 0; i < 4; i++) {
        const dentro = msg.ephemeralMessage?.message
            || msg.viewOnceMessage?.message
            || msg.viewOnceMessageV2?.message
            || msg.viewOnceMessageV2Extension?.message
            || msg.documentWithCaptionMessage?.message;
        if (!dentro) break;
        msg = dentro;
    }
    return msg;
}

export function contenutoMessaggio(msgIn: MsgWA | null | undefined): { msg: MsgWA; body: string; mime: string | null } {
    const msg = svolgiMessaggio(msgIn);
    let body: string = msg.conversation || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption || msg.videoMessage?.caption || msg.documentMessage?.caption
        || "";
    // #wa: gli sticker (image/webp) e i videomessaggi rotondi (ptv) hanno un
    // media anche quando il mimetype non arriva — senza mime non si scarica
    const mime: string | null = msg.imageMessage?.mimetype || msg.documentMessage?.mimetype
        || msg.audioMessage?.mimetype || msg.videoMessage?.mimetype
        || msg.stickerMessage?.mimetype || (msg.stickerMessage ? "image/webp" : null)
        || msg.ptvMessage?.mimetype || (msg.ptvMessage ? "video/mp4" : null);
    if (!body) {
        if (msg.imageMessage) body = "[Immagine]";
        else if (msg.documentMessage) body = `[Documento]${msg.documentMessage.fileName ? " " + msg.documentMessage.fileName : ""}`;
        else if (msg.audioMessage) body = msg.audioMessage.ptt ? "[Vocale]" : "[Audio]";
        else if (msg.videoMessage) body = "[Video]";
        else if (msg.ptvMessage) body = "[Videomessaggio]";
        else if (msg.stickerMessage) body = "[Sticker]";
        else if (msg.contactMessage) body = `[Contatto]${msg.contactMessage.displayName ? " " + msg.contactMessage.displayName : ""}`;
        else if (msg.contactsArrayMessage) {
            const nomi = (msg.contactsArrayMessage.contacts || []).map((c: MsgWA) => c?.displayName).filter(Boolean).join(", ");
            body = `[Contatti]${nomi ? " " + nomi : ""}`;
        } else if (msg.locationMessage) {
            const la = msg.locationMessage.degreesLatitude, lo = msg.locationMessage.degreesLongitude;
            body = (la != null && lo != null) ? `📍 Posizione: https://maps.google.com/?q=${la},${lo}` : "[Posizione]";
        } else if (msg.liveLocationMessage) body = "[Posizione in tempo reale]";
        else if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) {
            const p = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
            body = `[Sondaggio]${p?.name ? " " + p.name : ""}`;
        } else if (msg.buttonsResponseMessage) body = msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || "";
        else if (msg.listResponseMessage) body = msg.listResponseMessage.title || "";
        else if (msg.templateButtonReplyMessage) body = msg.templateButtonReplyMessage.selectedDisplayText || "";
        else if (msg.eventMessage) body = `[Evento]${msg.eventMessage.name ? " " + msg.eventMessage.name : ""}`;
    }
    return { msg, body, mime };
}
