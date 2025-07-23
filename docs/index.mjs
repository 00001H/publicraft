const server = localStorage.getItem("server");
if (server === null) {
    location.replace("./connect.html");
}
const libpanel = document.getElementById("libpanel");
const slot0 = document.getElementById("slot0");
const slot1 = document.getElementById("slot1");
const slots = [slot0, slot1];
const slot2 = document.getElementById("slot2");
const craft_button = document.getElementById("craft");
const statusmsg = document.getElementById("status");
const uname = document.getElementById("username");
const dbsearchbar = document.getElementById("dbsearchbar");
const dbsearchresults = document.getElementById("dbsearchresults");
class ItemElement extends HTMLDivElement {
    item;
    constructor(item) {
        super();
        this.item = item;
    }
}
;
customElements.define("crafting-item", ItemElement, { extends: "div" });
;
const BASE_ITEMS = [
    { name: "Water", icon: "💧", discoverer: "Neal Agarwal" },
    { name: "Fire", icon: "🔥", discoverer: "Neal Agarwal" },
    { name: "Wind", icon: "🌬️", discoverer: "Neal Agarwal" },
    { name: "Earth", icon: "🌍", discoverer: "Neal Agarwal" }
];
let items;
let itemnames = new Set();
function load_items() {
    const data = localStorage.getItem("items");
    if (data === null) {
        items = BASE_ITEMS.slice();
    }
    else {
        items = JSON.parse(data);
    }
    itemnames.clear();
    items.forEach(item => itemnames.add(item.name));
}
function save_items() {
    localStorage.setItem("items", JSON.stringify(items));
}
load_items();
const selected_ingredients = [null, null];
function set_ingredient(item, slot) {
    slots[slot].replaceChildren(display_item(item, ClickAction.NONE));
    selected_ingredients[slot] = item;
}
function remove_ingredient(slot) {
    slots[slot].replaceChildren();
    selected_ingredients[slot] = null;
}
for (let i = 0; i < slots.length; ++i) {
    slots[i].addEventListener("click", () => {
        remove_ingredient(i);
    });
}
var ClickAction;
(function (ClickAction) {
    ClickAction[ClickAction["NONE"] = 0] = "NONE";
    ClickAction[ClickAction["INSERT"] = 1] = "INSERT";
    ClickAction[ClickAction["INSERT_AND_REGISTER"] = 2] = "INSERT_AND_REGISTER";
})(ClickAction || (ClickAction = {}));
;
function display_item(item, clickaction) {
    const element = new ItemElement(item);
    element.classList.add("element");
    const icon = document.createElement("label");
    icon.textContent = item.icon;
    const label = document.createElement("label");
    label.textContent = item.name;
    element.append(icon, label);
    if (clickaction !== ClickAction.NONE) {
        element.classList.add("clickable");
        element.addEventListener("click", () => {
            if (clickaction === ClickAction.INSERT_AND_REGISTER) {
                register_item(item);
            }
            if (selected_ingredients[0] !== null && selected_ingredients[1] === null) {
                set_ingredient(item, 1);
            }
            else {
                set_ingredient(item, 0);
            }
        });
    }
    return element;
}
async function craft(lhs, rhs) {
    slot2.replaceChildren();
    const query = new URLSearchParams({ lhs: lhs.name, rhs: rhs.name, username: uname.value });
    const resp = await fetch(`${server}/craft?${query}`);
    if (resp.status !== 200) {
        statusmsg.textContent = `Server responds ${resp.status} (${await resp.text()})`;
        throw new Error("crafting request failed");
    }
    statusmsg.textContent = "";
    const [name, icon, discoverer] = await resp.json();
    const item = { name: name, icon: icon, discoverer: discoverer };
    register_item(item);
    return item;
}
function register_item(item) {
    if (!itemnames.has(item.name)) {
        items.push(item);
        libpanel.append(display_item(item, ClickAction.INSERT));
        itemnames.add(item.name);
    }
    save_items();
}
async function craft_selected() {
    const lhs = selected_ingredients[0];
    const rhs = selected_ingredients[1];
    if (lhs === null || rhs === null)
        return;
    const res = await craft(lhs, rhs);
    register_item(res);
    slot2.replaceChildren(display_item(res, ClickAction.INSERT));
}
craft_button.addEventListener("click", craft_selected);
function refresh_local_item_display() {
    libpanel.replaceChildren(...items.map(e => display_item(e, ClickAction.INSERT)));
}
refresh_local_item_display();
function hotkey(index) {
    const hovered = document.querySelector(".element:hover");
    if (hovered instanceof ItemElement) {
        if (hovered.item === selected_ingredients[index]) {
            remove_ingredient(index);
        }
        else {
            set_ingredient(hovered.item, index);
        }
    }
}
addEventListener("keyup", async (e) => {
    if (e.key === "1") {
        hotkey(0);
    }
    else if (e.key === "2") {
        hotkey(1);
    }
    else if (e.key === "3") {
        await craft_selected();
    }
});
let search_resp = null;
const utf8dec = new TextDecoder("utf-8", { fatal: true });
const str_length_buf = new DataView(new ArrayBuffer(4));
class CancelledError extends Error {
}
;
class EOFError extends Error {
}
;
async function read(stream, count) {
    let buf = new ArrayBuffer(count);
    let num_read = 0;
    while (num_read < count) {
        const result = await stream.read(new DataView(buf, num_read));
        if (result.value === undefined) {
            throw new CancelledError("Read cancelled");
        }
        buf = result.value.buffer;
        num_read += result.value.byteLength;
        if (result.done && num_read < count) {
            throw new EOFError("EOF while reading from stream");
        }
    }
    return buf;
}
async function rdstr(stream) {
    let size;
    try {
        size = new DataView(await read(stream, 4)).getUint32(0, true);
    }
    catch (e) {
        if (e instanceof EOFError) {
            return "";
        }
        throw e;
    }
    if (size === 0)
        return "";
    return utf8dec.decode(await read(stream, size));
}
dbsearchbar.value = "";
dbsearchbar.addEventListener("input", async () => {
    const kw = dbsearchbar.value;
    dbsearchresults.replaceChildren();
    if (kw.length > 0) {
        if (search_resp !== null) {
            search_resp.abort();
        }
        search_resp = new AbortController();
        const query = new URLSearchParams({ kw: kw });
        const resp = await fetch(`${server}/search?${query}`, { signal: search_resp.signal });
        const stream = resp.body.getReader({ mode: "byob" });
        while (true) {
            let data;
            try {
                data = await rdstr(stream);
            }
            catch (e) {
                if (e instanceof CancelledError) {
                    break;
                }
                throw e;
            }
            if (data === "")
                break;
            const [name, icon, discoverer] = JSON.parse(data);
            dbsearchresults.append(display_item({ name: name, icon: icon, discoverer: discoverer }, ClickAction.INSERT_AND_REGISTER));
        }
    }
});
export {};
