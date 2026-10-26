export declare function sanitizeRichTextHtml(html: string): string;

/**
 * Sanitise one admin-edited email copy field (heading, lead, note).
 * Inline markup only — the table shell around it is not editable, so a block
 * element from an editor would break the layout in Outlook.
 */
export declare function sanitizeEmailCopy(html: string): string;

/** Sanitise a whole custom email body, which supplies its own block structure. */
export declare function sanitizeEmailBody(html: string): string;

/**
 * Strip all markup and collapse whitespace. Subjects are concatenated into the
 * mail header unescaped, so they must carry no markup and no CR/LF.
 */
export declare function sanitizeEmailSubject(text: string): string;

/**
 * Validate an admin-chosen colour. These are interpolated straight into
 * `style="background-color: X"`, so anything but a literal hex is an
 * injection; returns `fallback` in that case.
 */
export declare function safeHexColor(value: unknown, fallback: string): string;
