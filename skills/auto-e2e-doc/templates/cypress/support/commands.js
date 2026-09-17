/// <reference types="cypress" />

/* ------------------------------------------------------------------ */
/* บันทึกเอกสาร: test case / step / capture                             */
/* ------------------------------------------------------------------ */

/** เริ่ม test case ใหม่ (เรียกบรรทัดแรกของ it) */
Cypress.Commands.add("tc", (id, title, objective) => {
  cy.task("tc:start", { id, title, objective }, { log: false });
});

/** ประกาศ step: สิ่งที่ทำ + ผลที่คาดหวัง (ข้อความนี้ลงเอกสาร docx ตรง ๆ) */
Cypress.Commands.add("step", (action, expected) => {
  cy.task("tc:step", { action, expected }, { log: false });
  Cypress.log({ name: "step", message: action });
});

/** บันทึกผลลัพธ์จริงที่ตรวจได้ลง step ล่าสุด (แสดงในคอลัมน์ "ผลลัพธ์จริง" ของ docx) */
Cypress.Commands.add("note", text => {
  cy.task("tc:note", String(text), { log: false });
  Cypress.log({ name: "note", message: text });
});

/**
 * เตรียม layout สำหรับภาพเอกสาร แล้วคืนค่า style เดิมหลัง capture
 *
 * Kendo Window ใช้ position:absolute และคำนวณ center จาก document ที่มี
 * grid กว้างกว่าหน้าจอ ทำให้ modal ถูกวางออกไปทางขวาได้ การจัดด้วยพิกัด
 * fixed ของ viewport โดยตรงจึงเสถียรกว่าการใช้ left:50% ร่วมกับ transform
 */
function prepareCaptureLayout(win) {
  const doc = win.document;
  const restore = [];
  // พื้นที่ที่ Cypress/Electron จับจริงอิง outer window ไม่ใช่ inner viewport
  // ซึ่งอาจถูก emulation ขยายเป็น 1440x810 ในระหว่างรัน test
  const captureWidth = Math.min(win.innerWidth, win.outerWidth || win.innerWidth);
  const captureHeight = Math.min(win.innerHeight, win.outerHeight || win.innerHeight);

  const remember = element => {
    if (!element) return element;
    restore.push({ element, style: element.getAttribute("style") });
    return element;
  };

  const restoreStyles = () => {
    restore.reverse().forEach(({ element, style }) => {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    });
  };

  const set = (element, property, value) => {
    if (element) element.style[property] = value;
  };

  win.scrollTo(0, 0);
  remember(doc.documentElement);
  remember(doc.body);
  set(doc.documentElement, "overflow", "hidden");
  set(doc.body, "overflow", "hidden");

  // ทำให้ตารางอยู่ในกรอบภาพ โดยคำนวณ scale จากความกว้างจริงของ table
  // ไม่ใช้ค่าคงที่ เพราะแต่ละข้อมูลอาจทำให้ column width เปลี่ยนได้
  const grid = doc.querySelector(".k-grid");
  if (grid) {
    remember(grid);
    const content = grid.querySelector(".k-grid-content");
    const tables = [...grid.querySelectorAll("table")];
    const tableWidths = tables.map(table =>
      Math.max(table.scrollWidth, table.getBoundingClientRect().width)
    );
    const tableWidth = Math.max(...tableWidths, 0);
    const gridWidth = content ? content.clientWidth : grid.clientWidth;
    const availableWidth = Math.max(Math.min(captureWidth - 48, gridWidth - 4), 480);
    const gridScale = tableWidth > availableWidth
      ? Math.min(0.75, availableWidth / tableWidth)
      : 0.75;
    // ย่อเฉพาะ table header/content ไม่ย่อ wrapper ของ grid
    // เพราะ Kendo ใช้ wrapper แยกกับ table หากย่อทั้ง wrapperแล้วขยาย width
    // footer และขอบขวาจะล้นออกนอก viewport ทำให้คอลัมน์ท้ายถูกตัด
    tables.forEach(table => {
      remember(table);
      set(table, "transform", `scale(${gridScale})`);
      set(table, "transformOrigin", "top left");
    });
    set(grid, "overflowX", "hidden");
    set(content, "overflowX", "hidden");
  }

  const maxWidth = Math.max(captureWidth - 48, 480);
  const maxHeight = Math.max(captureHeight - 48, 240);
  const visibleWindows = [...doc.querySelectorAll(".k-window")].filter(element => {
    const style = win.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  });

  visibleWindows.forEach(windowElement => {
    remember(windowElement);
    const content = windowElement.querySelector(":scope > .k-window-content") || windowElement.querySelector(".k-window-content");
    if (content) remember(content);

    const isAlert = windowElement.classList.contains("window-alertmessage") ||
      [...windowElement.classList].some(className => className.indexOf("window-message-") === 0);
    const computedStyle = win.getComputedStyle(windowElement);
    // getBoundingClientRect() อาจเป็นขนาดที่ถูก Kendo animation scale อยู่
    // จึงอ่าน width จาก CSS ที่ยังไม่ถูก transform แทน
    const cssWidth = parseFloat(computedStyle.width);
    const originalWidth = Number.isFinite(cssWidth) && cssWidth > 0
      ? cssWidth
      : windowElement.offsetWidth;
    let targetWidth = Math.min(originalWidth, maxWidth);

    // Popup เพิ่มข้อมูลมี form หลายกลุ่มลอยต่อกัน ถ้า content กว้างกว่า
    // กรอบเดิม ให้ขยายเท่าที่ viewport รับได้ก่อน แล้วค่อยจัดกึ่งกลาง
    if (!isAlert && content) {
      const contentWidth = Math.max(content.scrollWidth, content.getBoundingClientRect().width);
      targetWidth = Math.min(maxWidth, Math.max(targetWidth, contentWidth + 32));
    }

    set(windowElement, "position", "fixed");
    set(windowElement, "boxSizing", "border-box");
    set(windowElement, "width", `${Math.round(targetWidth)}px`);
    set(windowElement, "maxWidth", `${Math.round(maxWidth)}px`);
    set(windowElement, "right", "auto");
    set(windowElement, "bottom", "auto");
    set(windowElement, "margin", "0");
    set(windowElement, "transform", "none");

    if (content) {
      set(content, "boxSizing", "border-box");
      set(content, "maxWidth", "100%");
      set(content, "maxHeight", `${Math.round(maxHeight - 56)}px`);
      set(content, "overflowX", "hidden");
      set(content, "overflowY", "auto");
    }

    // ถ้า form ด้านในยังล้น ให้ย่อเฉพาะเนื้อหา popup ไม่ย่อทั้งหน้า
    // เพื่อให้กรอบ modal และตำแหน่งกึ่งกลางยังอ่านได้ครบในภาพ
    if (!isAlert && content && content.scrollWidth > targetWidth + 2) {
      const body = content.firstElementChild;
      if (body) {
        remember(body);
        const contentScale = Math.min(1, (targetWidth - 32) / content.scrollWidth);
        if (contentScale < 1) set(body, "zoom", String(contentScale));
      }
    }

    const rect = windowElement.getBoundingClientRect();
    set(windowElement, "left", `${Math.round(Math.max(24, (captureWidth - rect.width) / 2))}px`);
    set(windowElement, "top", `${Math.round(Math.max(24, (captureHeight - rect.height) / 2))}px`);
  });

  return restoreStyles;
}

/** capture หน้าจอแล้วแนบกับ step ล่าสุด */
Cypress.Commands.add("capture", name => {
  let restore = null;
  // Kendo เปิด modal ด้วย zoom animation 350ms ถ้า capture ก่อนจบ
  // getBoundingClientRect() จะคืนขนาดที่ถูกย่อและทำให้ตำแหน่งผิด
  cy.document().should(doc => {
    const win = doc.defaultView;
    const movingWindows = [...doc.querySelectorAll(".k-window")].filter(element => {
      const style = win.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return false;
      const transform = style.transform;
      if (!transform || transform === "none") return false;
      const match = transform.match(/^matrix\(([-\d.]+)/);
      return match ? Math.abs(parseFloat(match[1]) - 1) > 0.01 : true;
    });
    expect(movingWindows, "Kendo modal animation finished").to.have.length(0);
  });
  // รอ Kendo reflow ของ grid ให้เสร็จก่อน แล้วค่อยใส่ style สำหรับ capture
  // ถ้ารอหลังใส่ style Kendo จะคำนวณ table กลับเป็นความกว้างเดิมอีกครั้ง
  cy.wait(100);
  cy.window().then(win => {
    restore = prepareCaptureLayout(win);
  });
  cy.screenshot(name, { capture: "viewport", scale: false, overwrite: true });
  cy.then(() => {
    if (restore) restore();
  });
  cy.task("tc:attach", null, { log: false });
});

/* ------------------------------------------------------------------ */
/* Login                                                              */
/* ------------------------------------------------------------------ */

/**
 * Login ผ่านฟอร์ม userId/password (ไม่ใช้ Azure AD เพราะ redirect ออกนอก origin)
 * credential อ่านจาก cypress.env.json
 */
Cypress.Commands.add("login", () => {
  const { userId, password } = Cypress.env();
  if (!userId || !password) {
    throw new Error("ไม่พบ credential — copy cypress.env.example.json เป็น cypress.env.json แล้วใส่ค่า");
  }

  cy.session(
    ["universal-session", userId],
    () => {
      cy.visit(Cypress.env("signInRoute") || "/login");
      
      // Generic login logic (ปรับแก้ให้เข้ากับโปรเจกต์ของคุณ)
      cy.get("input[type='text'], input[name='username'], input[name='userId']").first().clear().type(userId);
      cy.get("input[type='password'], input[name='password']").first().clear().type(password, { log: false });
      
      // ค้นหาปุ่ม Login หรือ Submit
      cy.get("button[type='submit'], button.primary-btn, button:contains('Login'), button:contains('เข้าสู่ระบบ')").first().click();
      
      // รอให้หน้าเปลี่ยนไปจากหน้า SignIn/Login
      cy.location("pathname", { timeout: 60000 }).should("not.include", "login", { matchCase: false });

      // แอปเก็บ session ใน sessvars (object ใน memory) และ flush ลง sessionStorage เฉพาะตอน beforeunload
      // ต้องสั่ง flush เอง ไม่งั้น cy.session snapshot ได้ค่าว่าง
      cy.window().then(win => win.dispatchEvent(new win.Event("beforeunload")));
      cy.window().its("sessionStorage").invoke("getItem", "sessvars").should("not.be.null");
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        cy.window().its("sessionStorage").invoke("getItem", "sessvars").should("not.be.null");
      }
    }
  );
});

/* ------------------------------------------------------------------ */
/* UI Framework Helpers (Custom Selectors)                            */
/* ปรับแก้หรือเพิ่ม Custom Command ด้านล่างให้เข้ากับ UI ของคุณได้เลย      */
/* ------------------------------------------------------------------ */

/** ตัวอย่างหา control จากชื่อ label */
Cypress.Commands.add("field", label => {
  const re = new RegExp(`^\\s*${Cypress._.escapeRegExp(label)}\\s*:?\\s*$`);
  return cy.contains(".struct-inline td label", re).closest("td");
});

/** kendo-datepicker: พิมพ์วันที่ตามรูปแบบบนจอ (dd/MM/yyyy พ.ศ.) แล้ว blur ให้ kendo parse */
Cypress.Commands.add("kendoDate", (label, text) => {
  cy.field(label).find(".k-datepicker input").first().clear().type(text).blur();
});

/** kendo-combobox: พิมพ์ค้นหาแล้วเลือกรายการใน popup */
Cypress.Commands.add("kendoCombo", (label, text) => {
  cy.field(label).find(".k-combobox input").first().clear().type(text);
  cy.get(".k-animation-container:visible li", { timeout: 15000 }).contains(text).click();
});

/** kendo-combobox: เปิด dropdown แล้วเลือกรายการลำดับที่ index (yield ข้อความของรายการที่เลือก) */
Cypress.Commands.add("kendoComboPick", (label, index = 0) => {
  cy.field(label).find(".k-combobox .k-select").first().click();
  return cy
    .get(".k-animation-container:visible li", { timeout: 15000 })
    .eq(index)
    .then($li => {
      const text = $li.text().trim();
      cy.wrap($li).click();
      return cy.wrap(text);
    });
});

/** kendo-numerictextbox: input จริงซ่อนอยู่หลัง input ที่แสดง format */
Cypress.Commands.add("kendoNumber", (label, value) => {
  cy.field(label).within(() => {
    cy.get("input.k-formatted-value").first().focus();
    cy.get("input[data-role='numerictextbox']").first().clear({ force: true }).type(String(value), { force: true }).blur({ force: true });
  });
});

/* ------------------------------------------------------------------ */
/* Toolbar / Grid / Alert                                              */
/* ------------------------------------------------------------------ */

/** ปุ่มบน MainActionToolbar อ้างด้วย kendo icon (ไม่ขึ้นกับภาษา) เช่น save, reset, upload */
Cypress.Commands.add("toolbarButton", icon => cy.get(`.main-toolbar .k-i-${icon}`).parents(".k-button").first());

/** แถวข้อมูลของ kendo-vue-grid (ตารางหลัก ไม่รวม locked column ซ้ำ) */
Cypress.Commands.add("gridRows", () => cy.get(".k-grid-container .k-grid-content table tbody tr.k-master-row"));

/** ข้อความหัวคอลัมน์ของ grid หลัก (ไม่รวม checkbox) */
Cypress.Commands.add("gridHeaders", () =>
  cy.get(".k-grid-header table thead th").then($th =>
    Cypress._.compact([...$th].map(th => th.innerText.trim()))
  )
);

/** modal ของ AlertMessage */
Cypress.Commands.add("alertModal", () => cy.get(".window-alertmessage:visible"));
