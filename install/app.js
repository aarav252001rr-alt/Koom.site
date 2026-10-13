(() => {
  const installButtons = [
    document.getElementById("installBtn"),
    document.getElementById("installBtnBottom")
  ].filter(Boolean);
  const mainButtonText = document.getElementById("installBtnText");
  const status = document.getElementById("statusMessage");
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
    !window.MSStream;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setButtons(label, disabled = false) {
    installButtons.forEach((button) => {
      const labelNode = button.querySelector("span");
      if (labelNode) labelNode.textContent = label;
      button.disabled = disabled;
      button.classList.toggle("is-disabled", disabled);
    });
    if (mainButtonText) mainButtonText.textContent = label;
  }

  function updateInstalledState() {
    if (isStandalone()) {
      setButtons("Open KOOM");
      setStatus("KOOM is installed on this device. Open the app from your home screen.");
      installButtons.forEach((button) => button.addEventListener("click", () => {
        window.location.href = "/";
      }, { once: true }));
    }
  }

  async function handleInstall() {
    if (isStandalone()) {
      window.location.href = "/";
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result && result.outcome === "accepted") {
        setStatus("Great choice! KOOM is being added to your device.");
      } else {
        setStatus("No problem — you can install KOOM whenever you're ready.");
      }
      deferredPrompt = null;
      setButtons("Install KOOM");
      return;
    }

    if (isIOS()) {
      setStatus("On iPhone/iPad: tap Share in Safari, then choose “Add to Home Screen”.");
      document.getElementById("how-to-install")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    setStatus("Install prompt isn't available right now. Use your browser menu and choose “Install app” or “Add to Home screen”.");
    document.getElementById("how-to-install")?.scrollIntoView({ behavior: "smooth" });
  }

  installButtons.forEach((button) => button.addEventListener("click", handleInstall));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setButtons("Install KOOM");
    setStatus("KOOM is ready to install.");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setButtons("Installed");
    installButtons.forEach((button) => { button.disabled = true; });
    setStatus("KOOM was installed successfully. Find it on your home screen.");
  });

  updateInstalledState();

  if (!isStandalone() && isIOS()) {
    setStatus("iPhone/iPad? Use Safari's Share menu to add KOOM to your home screen.");
  } else if (!isStandalone()) {
    setStatus("Tap Install KOOM when your browser makes the install prompt available.");
  }
})();