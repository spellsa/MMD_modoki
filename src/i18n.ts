import { createInstance, type Resource } from "i18next";
import jaTranslation from "../language/ja.json";
import enTranslation from "../language/en.json";

export type UiLocale = "ja" | "en";

type TranslationTable = Record<string, string>;

const STORAGE_KEY = "mmd.ui.locale";
const DEFAULT_LOCALE: UiLocale = "ja";

const translations: Record<UiLocale, TranslationTable> = {
    ja: jaTranslation as TranslationTable,
    en: enTranslation as TranslationTable,
};

const resources: Resource = {
    ja: { translation: translations.ja },
    en: { translation: translations.en },
};

const i18nInstance = createInstance();

let currentLocale: UiLocale = DEFAULT_LOCALE;
let i18nInitialized = false;

const isLocale = (value: string | null | undefined): value is UiLocale => {
    return value === "ja" || value === "en";
};

const resolveLocaleFromEnvironment = (): UiLocale => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
    const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
    return nav.startsWith("ja") ? "ja" : DEFAULT_LOCALE;
};

const ensureI18nInitialized = (locale: UiLocale): void => {
    if (i18nInitialized) return;
    void i18nInstance.init({
        resources,
        lng: locale,
        fallbackLng: DEFAULT_LOCALE,
        initImmediate: false,
        interpolation: {
            escapeValue: false,
            prefix: "{",
            suffix: "}",
        },
    });
    i18nInitialized = true;
};

const applyKeyToAttribute = (
    root: ParentNode,
    dataAttr: string,
    targetAttr: string,
): void => {
    const selector = `[${dataAttr}]`;
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        const key = element.getAttribute(dataAttr);
        if (!key) return;
        element.setAttribute(targetAttr, t(key));
    });
};

export const t = (key: string, params?: Record<string, string | number>): string => {
    ensureI18nInitialized(currentLocale);
    return i18nInstance.t(key, {
        ...params,
        defaultValue: key,
        lng: currentLocale,
    });
};

export const getLocale = (): UiLocale => currentLocale;

export const applyI18nToDom = (root: ParentNode = document): void => {
    root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
        const key = element.dataset.i18n;
        if (!key) return;
        element.textContent = t(key);
    });
    applyKeyToAttribute(root, "data-i18n-title", "title");
    applyKeyToAttribute(root, "data-i18n-aria-label", "aria-label");
    applyKeyToAttribute(root, "data-i18n-placeholder", "placeholder");
};

export const setLocale = (
    locale: UiLocale,
    options?: {
        persist?: boolean;
        applyToDom?: boolean;
        root?: ParentNode;
        emitEvent?: boolean;
    },
): void => {
    if (!isLocale(locale)) return;
    const persist = options?.persist ?? true;
    const applyToDom = options?.applyToDom ?? true;
    const emitEvent = options?.emitEvent ?? true;

    currentLocale = locale;
    ensureI18nInitialized(locale);
    if (i18nInstance.language !== locale) {
        void i18nInstance.changeLanguage(locale);
    }
    if (persist && typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, locale);
    }
    if (applyToDom) {
        applyI18nToDom(options?.root ?? document);
    }
    if (emitEvent && typeof document !== "undefined") {
        document.dispatchEvent(
            new CustomEvent("app:locale-changed", {
                detail: { locale },
            }),
        );
    }
};

export const initializeI18n = (root: ParentNode = document): UiLocale => {
    const initialLocale = resolveLocaleFromEnvironment();
    ensureI18nInitialized(initialLocale);
    setLocale(initialLocale, {
        persist: false,
        applyToDom: true,
        root,
        emitEvent: false,
    });
    return initialLocale;
};

declare global {
    interface Window {
        mmdI18n?: {
            getLocale: typeof getLocale;
            setLocale: typeof setLocale;
            apply: typeof applyI18nToDom;
        };
    }
}

if (typeof window !== "undefined") {
    window.mmdI18n = {
        getLocale,
        setLocale,
        apply: applyI18nToDom,
    };
}
