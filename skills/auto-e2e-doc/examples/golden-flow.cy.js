/// <reference types="cypress" />
/**
 * SCR-201 ขั้นตอนการขออนุมัติตัดหนี้สูญ
 *
 * เอกสารชุดนี้ตั้งใจทำเป็น flow สั้น ๆ สำหรับอธิบายการใช้งานจริง
 * ให้ครบตามหน้าจอและ BRD โดยเลือกตัวแทนเพียงค่าเดียวต่อ dropdown
 * flow สั้น ๆ ใช้ข้อมูลจากหน้าจอจริง และมีเคสกดบันทึกจริงหนึ่งรายการ
 */

const ROUTE = "/Account/RequestWriteoffBadDebt/Index";

function search(alias = "search") {
  cy.intercept("GET", "**/WriteoffBadDebt/GetRequests*").as(alias);
  cy.contains("button", "ค้นหา").click();
  return cy.wait(`@${alias}`, { timeout: 120000 }).then(({ response }) => {
    expect(response.statusCode, "HTTP status").to.eq(200);
    const rows = (response.body && response.body.content) || [];
    expect(rows.length, "ผลการค้นหา").to.be.greaterThan(0);
    return cy.wait(1000).then(() => rows);
  });
}

describe("SCR-201 ขั้นตอนการขออนุมัติตัดหนี้สูญ", () => {
  beforeEach(() => {
    cy.login();
    cy.visit(ROUTE);
    cy.contains("label", "วันที่ฟ้องจาก", { timeout: 60000 }).should("be.visible");
    cy.get("body").should($body => {
      const loading = $body.find(".k-window:visible").filter((_, el) => el.innerText.includes("Loading..."));
      expect(loading, "หน้าจอโหลดเสร็จ").to.have.length(0);
    });
    // ยุบเมนูด้านซ้ายให้พื้นที่เนื้อหาเต็ม viewport เหมือนภาพตัวอย่าง
    cy.get(".sidebar-toggle-box").should("be.visible").click();
    cy.get(".main-content").should("have.class", "left-main-content");
    cy.wait(400);
  });

  it("เปิดหน้าจอ", () => {
    cy.tc("TC-01", "เปิดหน้าจอขออนุมัติตัดหนี้สูญ", "");
    cy.step("เข้าเมนู บัญชี > บันทึก > ขออนุมัติตัดหนี้สูญ", "");
    cy.capture("TC-01-1-open");
  });

  it("ค้นหาโดยไม่ระบุเงื่อนไข", () => {
    cy.tc("TC-02", "ค้นหารายการ", "");
    cy.step("กดปุ่ม ค้นหาเพื่อแสดงรายการ", "");
    search().then(rows => {
      cy.gridRows().should("have.length.greaterThan", 0);
      cy.note(`พบ ${rows.length} รายการ`);
    });
    cy.capture("TC-01-2-search");
  });

  it("ค้นหาด้วยวันที่ฟ้องจากและวันที่ฟ้องถึง", () => {
    cy.tc("TC-03", "ค้นหาด้วยช่วงวันที่ฟ้อง", "");
    cy.step("ระบุวันที่ฟ้องจาก 01/01/2568 และวันที่ฟ้องถึง 30/06/2568 แล้วกดค้นหา", "");
    cy.kendoDate("วันที่ฟ้องจาก", "01/01/2568");
    cy.kendoDate("วันที่ฟ้องถึง", "30/06/2568");
    search().then(rows => cy.note(`พบ ${rows.length} รายการ`));
    cy.capture("TC-03-1-filing-date");
  });

  it("ค้นหาด้วยประเภทฟ้อง", () => {
    cy.tc("TC-04", "ค้นหาด้วยประเภทฟ้อง", "");
    cy.step("เลือกประเภทฟ้อง 1 รายการ แล้วกดค้นหา", "");
    cy.kendoCombo("ประเภทฟ้อง", "R002 ฟ้องขายขาดทุน");
    search().then(rows => cy.note(`พบ ${rows.length} รายการ`));
    cy.capture("TC-04-1-lawsuit-type");
  });

  it("ค้นหาด้วยประเภทธุรกิจ", () => {
    cy.tc("TC-05", "ค้นหาด้วยประเภทธุรกิจ", "");
    cy.step("เลือกประเภทธุรกิจ 1 รายการ แล้วกดค้นหา", "");
    cy.kendoCombo("ประเภทธุรกิจ", "ฝ่ายธุรกิจเช่าซื้อรถยนต์");
    search().then(rows => cy.note(`พบ ${rows.length} รายการ`));
    cy.capture("TC-05-1-business-type");
  });

  it("ค้นหาด้วยช่วงทุนทรัพย์", () => {
    cy.tc("TC-06", "ค้นหาด้วยช่วงทุนทรัพย์", "");
    cy.step("ระบุทุนทรัพย์จาก 100,000 และทุนทรัพย์ถึง 500,000 แล้วกดค้นหา", "");
    cy.kendoNumber("ทุนทรัพย์จาก", 100000);
    cy.kendoNumber("ทุนทรัพย์ถึง", 500000);
    search().then(rows => cy.note(`พบ ${rows.length} รายการ`));
    cy.capture("TC-06-1-claim-amount");
  });

  it("ค้นหาด้วยเงื่อนไขการใช้สิทธิ์", () => {
    cy.tc("TC-07", "ค้นหาด้วยเงื่อนไขการใช้สิทธิ์", "");
    cy.step("เลือกเงื่อนไขการใช้สิทธิ์ 1 รายการ แล้วกดค้นหา", "");
    cy.kendoComboPick("เงื่อนไขการใช้สิทธิ์", 0);
    search().then(rows => cy.note(`พบ ${rows.length} รายการ`));
    cy.capture("TC-07-1-right-condition");
  });

  it("กดบันทึกและตรวจสอบแจ้งเตือนเมื่อยังไม่เลือกรายการ", () => {
    cy.tc("TC-08", "กดบันทึกและตรวจสอบแจ้งเตือน", "");
    cy.step("กดปุ่ม บันทึก โดยยังไม่เลือกรายการในตาราง", "");
    cy.toolbarButton("save").click();
    cy.alertModal().should("contain.text", "กรุณาเลือกรายการ");
    cy.capture("TC-08-1-save-alert");
  });

  it("เพิ่มข้อมูลและตรวจสอบปุ่มบันทึกใน popup", () => {
    cy.tc("TC-09", "เพิ่มข้อมูล", "");
    cy.step("กดปุ่ม เพิ่มข้อมูล เพื่อเปิดหน้าต่างข้อมูลการตัดหนี้สูญ", "");
    cy.contains("button", "เพิ่มข้อมูล").click();
    cy.get(".k-window:visible", { timeout: 15000 }).should("contain.text", "ข้อมูลการตัดหนี้สูญ");
    cy.capture("TC-09-1-add-data");

    cy.step("กดปุ่ม เพิ่มใน popup โดยยังไม่ระบุเลขที่สัญญา", "");
    cy.get(".k-window:visible")
      .filter((_, el) => el.innerText.includes("ข้อมูลการตัดหนี้สูญ"))
      .first()
      .within(() => cy.contains("button", "เพิ่ม").click());
    cy.alertModal().should("contain.text", "กรุณาเลือกรายการ");
    cy.capture("TC-09-2-add-alert");
  });

  it("เลือกหนึ่งรายการและบันทึกคำขอจริง", () => {
    cy.tc("TC-12", "เลือกข้อมูลและบันทึกคำขอจริง", "");
    cy.intercept("POST", "**/WriteoffBadDebt/SaveRequestWriteoffBadDebt").as("saveRequest");
    cy.step("กดค้นหา แล้วเลือกข้อมูลในตาราง 1 รายการ", "");
    search().then(rows => {
      cy.gridRows().first().find("input.k-checkbox").check({ force: true });
      cy.gridRows().first().find("input.k-checkbox").should("be.checked");
      cy.note(`เลือก ${rows.length > 0 ? "1 รายการ" : "0 รายการ"}`);
    });
    cy.capture("TC-12-1-select");

    cy.step("กดปุ่ม บันทึก เพื่อส่งคำขอจริง", "");
    cy.toolbarButton("save").should("be.visible").click({ force: true });
    cy.wait("@saveRequest", { timeout: 120000 }).then(({ response }) => {
      expect(response.statusCode, "save HTTP status").to.eq(200);
      cy.note("บันทึกคำขอจริงสำเร็จ");
    });
    cy.wait(600);
    cy.capture("TC-12-2-save");
  });

  it("ส่งออกข้อมูลเป็น Excel", () => {
    cy.tc("TC-10", "ส่งออกข้อมูลเป็น Excel", "");
    cy.step("กดค้นหา แล้วกดปุ่มส่งออก Excel", "");
    search().then(rows => {
      cy.gridRows().should("have.length.greaterThan", 0);
      cy.note(`พบ ${rows.length} รายการ`);
    });
    cy.get(".k-i-excel").parents(".k-button").first().click();
    cy.wait(1000);
    cy.capture("TC-10-1-export");
  });

  it("ล้างค่าบนหน้าจอ", () => {
    cy.tc("TC-11", "ล้างค่าบนหน้าจอ", "");
    cy.step("ระบุทุนทรัพย์จาก 100,000 แล้วกดปุ่ม ล้างค่า", "");
    cy.kendoNumber("ทุนทรัพย์จาก", 100000);
    cy.toolbarButton("reset").click();
    cy.field("ทุนทรัพย์จาก").find("input.k-formatted-value").first().should("have.value", "0.00");
    cy.capture("TC-11-1-reset");
  });
});
