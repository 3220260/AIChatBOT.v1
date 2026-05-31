const GREEK_TO_LATIN = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "i",
  φ: "f",
  χ: "x",
  ψ: "ps",
  ω: "o"
};

export function stripGreekTones(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function greekToLatin(text = "") {
  return String(text).replace(/[α-ως]/g, (char) => GREEK_TO_LATIN[char] || char);
}

export function normalizeGreeklish(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/8/g, "th")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/ph/g, "f")
    .replace(/ch/g, "x")
    .replace(/kh/g, "x")
    .replace(/ks/g, "x")
    .replace(/ou/g, "u")
    .replace(/h/g, "i")
    .replace(/y/g, "i")
    .replace(/ei/g, "i")
    .replace(/oi/g, "i")
    .replace(/ai/g, "e")
    .replace(/\bthlefon/g, "tilefon")
    .replace(/\btilephon/g, "tilefon")
    .replace(/\bkinhth/g, "kinito")
    .replace(/\bkiniti/g, "kinito")
    .replace(/\bstatherh/g, "statheri")
    .replace(/\bforhtothta/g, "foritotita")
    .replace(/\bforitothta/g, "foritotita")
    .replace(/\bforhtotita/g, "foritotita")
    .replace(/\bdikaiologhtika/g, "dikaiologitika")
    .replace(/\bdikeologhtika/g, "dikeologitika")
    .replace(/\bdikeologitika/g, "dikeologitika")
    .replace(/\baithsh/g, "aitisi")
    .replace(/\bepikinonia/g, "epikoinonia")
    .replace(/\bepikinono/g, "epikoinon")
    .replace(/\bepikoinono/g, "epikoinon")
    .replace(/\bstelnw/g, "stelno")
    .replace(/\bsteal\b/g, "steil")
    .replace(/\bstile\b/g, "steil")
    .replace(/\bstilw\b/g, "steil")
    .replace(/\bstelnw\b/g, "stelno")
    .replace(/\bteile\b/g, "steile")
    .replace(/\bmoi\b/g, "mou")
    .replace(/\bmoy\b/g, "mou")
    .replace(/\btaytotita/g, "tautotita")
    .replace(/\btautothta/g, "tautotita")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSearchKey(text = "") {
  const withoutTones = stripGreekTones(String(text).toLowerCase());
  const latin = greekToLatin(withoutTones);
  return normalizeGreeklish(latin);
}

export function toSmallTalkKey(text = "") {
  return stripGreekTones(String(text).toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
