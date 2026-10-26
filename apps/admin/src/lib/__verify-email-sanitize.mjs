import { sanitizeEmailCopy, sanitizeEmailBody, sanitizeEmailSubject, safeHexColor } from "@repo/sanitize-html";
let f = 0;
const ck = (l, ok, d) => { console.log(`${ok ? "  OK  " : " FAIL "} ${l}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); if (!ok) f++; };

console.log("— copy fields: inline only —");
ck("script stripped", !sanitizeEmailCopy('hej <script>alert(1)</script>').includes("script"), sanitizeEmailCopy('hej <script>alert(1)</script>'));
ck("onerror stripped", !sanitizeEmailCopy('<img src=x onerror=alert(1)>').includes("onerror"));
ck("javascript: href dropped", !sanitizeEmailCopy('<a href="javascript:alert(1)">x</a>').includes("javascript:"));
ck("bold kept", sanitizeEmailCopy("<strong>Hej</strong>") === "<strong>Hej</strong>");
ck("nbsp entity survives", sanitizeEmailCopy("1&nbsp;000 kr").includes("\u00a0") || sanitizeEmailCopy("1&nbsp;000 kr").includes("&nbsp;"), sanitizeEmailCopy("1&nbsp;000 kr"));
ck("block tag stripped from copy", !sanitizeEmailCopy("<table><tr><td>x</td></tr></table>").includes("<table"));

console.log("\n— body fields: blocks allowed —");
ck("table kept in body", sanitizeEmailBody("<table><tr><td>x</td></tr></table>").includes("<table"));
ck("script still stripped in body", !sanitizeEmailBody("<script>alert(1)</script>").includes("script"));
ck("style attr kept", sanitizeEmailBody('<p style="color:red">x</p>').includes("style"));

console.log("\n— subject: no markup, no header injection —");
ck("tags stripped", sanitizeEmailSubject("<b>Order</b> klar") === "Order klar", sanitizeEmailSubject("<b>Order</b> klar"));
ck("CRLF collapsed", !sanitizeEmailSubject("Order\r\nBcc: evil@x.com").includes("\n"), sanitizeEmailSubject("Order\r\nBcc: evil@x.com"));

console.log("\n— colours: validated, not sanitised —");
ck("valid hex passes", safeHexColor("#dcfce7", "#fff") === "#dcfce7");
ck("short hex passes", safeHexColor("#abc", "#fff") === "#abc");
ck("css injection rejected", safeHexColor("red; } body { display:none", "#fff") === "#fff");
ck("named colour rejected", safeHexColor("red", "#fff") === "#fff");
ck("non-string rejected", safeHexColor({}, "#fff") === "#fff");

console.log(`\n${f === 0 ? "ALL PASS" : `${f} FAILED`}`);
process.exit(f === 0 ? 0 : 1);
