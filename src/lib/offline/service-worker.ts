export async function registerFieldWorker() {
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !window.indexedDB
  ) {
    throw new Error(
      "Hors connexion indisponible : utilisez un navigateur récent en HTTPS, hors navigation privée.",
    );
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  const registration = await navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error: unknown) => {
      if (existing?.active) return existing;
      throw error;
    });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Installation incomplète. Gardez le réseau puis réessayez.",
              ),
            ),
          30_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  return registration;
}

export async function verifyFieldShell() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const worker = registration?.active;
  if (!worker)
    throw new Error(
      "Application hors connexion non installée. Réessayez avec du réseau.",
    );
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(
        new Error(
          "Vérification de l’app impossible. Fermez ses onglets puis rouvrez-la avec du réseau.",
        ),
      );
    }, 10_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "ready" in event.data &&
        event.data.ready === true
      )
        resolve();
      else
        reject(
          new Error(
            "Application locale incomplète. Effacez les données du site, puis préparez-la à nouveau avec du réseau.",
          ),
        );
    };
    worker.postMessage({ type: "FIELD_SHELL_STATUS" }, [channel.port2]);
  });
}
