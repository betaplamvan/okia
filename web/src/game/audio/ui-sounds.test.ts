// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const playUi = vi.fn();
vi.mock("./audio-manager", () => ({ audio: { playUi: (k: string) => playUi(k) } }));

const { attachUiSounds, sfxFor } = await import("./ui-sounds");

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("sfxFor — tiếng cho một click", () => {
  it("nút, link, tab, công tắc mặc định kêu click", () => {
    expect(sfxFor(el("<button>Ok</button>"))).toBe("click");
    expect(sfxFor(el('<a href="/shop">Shop</a>'))).toBe("click");
    expect(sfxFor(el('<div role="tab">A</div>'))).toBe("click");
    expect(sfxFor(el('<input type="checkbox" />'))).toBe("click");
  });

  it("click vào phần tử con bên trong nút vẫn kêu", () => {
    const btn = el("<button><span>Chơi</span></button>");
    expect(sfxFor(btn.firstElementChild)).toBe("click");
  });

  it("văn bản thường, nút vô hiệu, data-sfx=none thì im", () => {
    expect(sfxFor(el("<p>chữ</p>"))).toBeNull();
    expect(sfxFor(el("<button disabled>Ok</button>"))).toBeNull();
    expect(sfxFor(el('<button aria-disabled="true">Ok</button>'))).toBeNull();
    const board = el('<div data-sfx="none"><button>Ô</button></div>');
    expect(sfxFor(board.firstElementChild)).toBeNull();
  });

  it("data-sfx đổi loại tiếng; giá trị lạ về click", () => {
    expect(sfxFor(el('<button data-sfx="confirm">Chơi luôn!</button>'))).toBe("confirm");
    expect(sfxFor(el('<button data-sfx="back">Hủy</button>'))).toBe("back");
    expect(sfxFor(el('<button data-sfx="boom">?</button>'))).toBe("click");
  });
});

describe("attachUiSounds — listener toàn cục", () => {
  beforeEach(() => playUi.mockClear());

  it("phát tiếng khi bấm nút, không phát cho chữ thường, gỡ được", () => {
    const off = attachUiSounds(document);
    document.body.innerHTML = '<button data-sfx="confirm">A</button><p>b</p>';
    document.querySelector("button")!.click();
    document.querySelector("p")!.click();
    expect(playUi.mock.calls).toEqual([["confirm"]]);
    off();
    document.querySelector("button")!.click();
    expect(playUi).toHaveBeenCalledTimes(1);
  });

  it("hai click sát nhau (label → input tổng hợp) chỉ kêu một lần", () => {
    const off = attachUiSounds(document);
    document.body.innerHTML = '<label><input type="checkbox" />Bật</label>';
    document.querySelector("label")!.click(); // label click + input click tổng hợp
    expect(playUi).toHaveBeenCalledTimes(1);
    off();
  });
});
