(() => {
  const viewport = document.querySelector('meta[name="viewport"]');

  const switchViewport = () => {
    const value = window.outerWidth > 360 ? "width=device-width,initial-scale=1" : "width=360";

    if (viewport.getAttribute("content") !== value) {
      viewport.setAttribute("content", value);
    }
  };

  window.addEventListener("resize", switchViewport, false);
  switchViewport();
})();

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const drawerButton = document.querySelector("#js-drawer-button");
  const drawer = document.querySelector("#js-drawer");
  const header = document.querySelector("#js-header");
  const headerHeight = header ? header.offsetHeight : 0;
  const DESKTOP_WIDTH = 768;

  const toggleDrawer = () => {
    const isActive = drawer.classList.toggle("is-active");
    body.classList.toggle("is-no-scroll", isActive);
    drawerButton.classList.toggle("is-active", isActive);
  };

  const resetDrawerState = () => {
    if (window.innerWidth >= DESKTOP_WIDTH) {
      body.classList.remove("is-no-scroll");
      drawer.classList.remove("is-active");
      drawerButton.classList.remove("is-active");
    }
  };

  if (drawerButton) {
    drawerButton.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDrawer();
    });
  }

  window.addEventListener("resize", resetDrawerState);

  // FAQアコーディオンの設定
  document.querySelectorAll(".js-fqa-accordion").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      item.parentNode.classList.toggle("is-active");
    });
  });

  // スムーズスクロールの設定
  document.querySelectorAll(`a[href^="#"],a[href^="${window.location.pathname}#"],a[href^="${window.location.origin}${window.location.pathname}#"]`).forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      const id = href.includes("#") ? href.substring(href.indexOf("#")) : href;
      const target = document.querySelector(id === "#" ? "html" : id);

      if (target) {
        const position = target.offsetTop - headerHeight;
        body.classList.remove("is-no-scroll");
        drawer.classList.remove("is-active");
        drawerButton.classList.remove("is-active");

        window.scrollTo({
          top: position,
          behavior: "smooth",
        });
      }
    });
  });
});
