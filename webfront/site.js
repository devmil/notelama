"use strict";
const languageSelect = document.querySelector("#language");
const languageError = document.querySelector("#language-error");
let revision = 0;
let currentLanguage = "en";
async function setLanguage(language) {
  if (!["en", "de"].includes(language)) language = "en";
  const request = ++revision;
  try {
    const response = await fetch(`locales/${language}.json`);
    if (!response.ok) throw new Error("Language unavailable");
    const strings = await response.json();
    if (request !== revision) return;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = strings[element.dataset.i18n];
    });
    document.title = strings.title;
    document.querySelector('meta[name="description"]').content = strings.description;
    document.documentElement.lang = language;
    languageSelect.value = language;
    currentLanguage = language;
    languageError.hidden = true;
    try { localStorage.setItem("notelama.language", language); } catch (_) { /* Storage is optional. */ }
  } catch (_) {
    if (request !== revision) return;
    languageSelect.value = currentLanguage;
    languageError.textContent = currentLanguage === "de"
      ? "Die Sprache konnte nicht geladen werden. Bitte versuche es erneut."
      : "The language could not be loaded. Please try again.";
    languageError.hidden = false;
  }
}
languageSelect.addEventListener("change", (event) => setLanguage(event.target.value));
let preferred = navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
try { preferred = localStorage.getItem("notelama.language") || preferred; } catch (_) { /* Storage is optional. */ }
setLanguage(preferred);
