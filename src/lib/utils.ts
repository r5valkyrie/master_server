export function getTimeSeconds() {
    return Math.floor(Date.now() / 1000);
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertLength(param: any, min: number, max: number) {
    if (typeof param !== "string") {
        return false;
    }
    if (param.length < min || param.length > max) {
        return false;
    }
    return true;
}

export function isNumeric(str: any) {
    if (typeof str != "string") return false;
    return !isNaN(str as any) && !isNaN(parseFloat(str));
}

const languages = [
    "english", "french", "german", "italian", "japanese", "polish", "russian", "spanish", "schinese", "tchinese", "korean"
];


export function ValidateLanguage(lang: any) {
    if (!lang) return "english";
    if (languages.includes(lang)) return lang;
    return "english";
}
