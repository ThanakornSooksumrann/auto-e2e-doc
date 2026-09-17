import "./commands";

// แอปมี global error handler ของตัวเอง exception จาก kendo widget ตอน teardown
// ไม่ควรทำให้เทสล้ม (ถ้าต้องจับ error จริงให้ assert ที่หน้าจอแทน)
Cypress.on("uncaught:exception", () => false);

// ส่งผลของแต่ละ it() กลับไปบันทึกใน result.json
afterEach(function () {
  const t = this.currentTest;
  cy.task("tc:end", {
    state: t.state,
    error: t.err ? String(t.err.message).split("\n")[0] : null
  }, { log: false });
});
