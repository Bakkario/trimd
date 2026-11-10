// 01 §2.1 / D-4.4 (ADR-033) — Inline and block LaTeX math parser & Unicode renderer.

const SUP_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ',
  'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ',
  's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ',
  'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'π': 'π', 'θ': 'ᶿ', 'φ': 'ᵠ', 'χ': 'ᵡ', 'γ': 'ᵞ',
};

const SUB_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

function toSuperscript(s: string): string {
  return Array.from(s).map((c) => SUP_MAP[c.toLowerCase()] ?? c).join('');
}

function toSubscript(s: string): string {
  return Array.from(s).map((c) => SUB_MAP[c.toLowerCase()] ?? c).join('');
}

const BB_MAP: Record<string, string> = {
  R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ',
};

const CAL_MAP: Record<string, string> = {
  O: '𝒪', L: 'ℒ', H: 'ℋ',
};

function toBold(s: string): string {
  return Array.from(s).map((c) => {
    const cp = c.codePointAt(0) ?? 0;
    if (cp >= 65 && cp <= 90) return String.fromCodePoint(0x1D400 + cp - 65);
    if (cp >= 97 && cp <= 122) return String.fromCodePoint(0x1D41A + cp - 97);
    if (cp >= 48 && cp <= 57) return String.fromCodePoint(0x1D7CE + cp - 48);
    return c;
  }).join('');
}

export function renderLatexToUnicode(tex: string): string {
  let s = tex.trim();
  s = s.replace(/\\\\/g, '\n');
  s = s.replace(/&/g, '');

  // 1. Text & font commands
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');

  // 2. Blackboard bold
  s = s.replace(/\\mathbb\{([A-Z])\}/g, (_, c) => BB_MAP[c] ?? c);

  // 3. Calligraphic
  s = s.replace(/\\mathcal\{([A-Z])\}/g, (_, c) => CAL_MAP[c] ?? c);

  // 4. Bold
  s = s.replace(/\\mathbf\{([^}]*)\}/g, (_, c) => toBold(c));

  // 5. Symbols
  s = s
    .replace(/\\alpha(?![a-zA-Z])/g, 'α')
    .replace(/\\beta(?![a-zA-Z])/g, 'β')
    .replace(/\\gamma(?![a-zA-Z])/g, 'γ')
    .replace(/\\delta(?![a-zA-Z])/g, 'δ')
    .replace(/\\varepsilon(?![a-zA-Z])/g, 'ε')
    .replace(/\\epsilon(?![a-zA-Z])/g, 'ϵ')
    .replace(/\\zeta(?![a-zA-Z])/g, 'ζ')
    .replace(/\\eta(?![a-zA-Z])/g, 'η')
    .replace(/\\theta(?![a-zA-Z])/g, 'θ')
    .replace(/\\iota(?![a-zA-Z])/g, 'ι')
    .replace(/\\kappa(?![a-zA-Z])/g, 'κ')
    .replace(/\\lambda(?![a-zA-Z])/g, 'λ')
    .replace(/\\mu(?![a-zA-Z])/g, 'μ')
    .replace(/\\nu(?![a-zA-Z])/g, 'ν')
    .replace(/\\xi(?![a-zA-Z])/g, 'ξ')
    .replace(/\\pi(?![a-zA-Z])/g, 'π')
    .replace(/\\rho(?![a-zA-Z])/g, 'ρ')
    .replace(/\\sigma(?![a-zA-Z])/g, 'σ')
    .replace(/\\tau(?![a-zA-Z])/g, 'τ')
    .replace(/\\phi(?![a-zA-Z])/g, 'φ')
    .replace(/\\chi(?![a-zA-Z])/g, 'χ')
    .replace(/\\psi(?![a-zA-Z])/g, 'ψ')
    .replace(/\\omega(?![a-zA-Z])/g, 'ω')
    .replace(/\\Gamma(?![a-zA-Z])/g, 'Γ')
    .replace(/\\Delta(?![a-zA-Z])/g, 'Δ')
    .replace(/\\Theta(?![a-zA-Z])/g, 'Θ')
    .replace(/\\Lambda(?![a-zA-Z])/g, 'Λ')
    .replace(/\\Xi(?![a-zA-Z])/g, 'Ξ')
    .replace(/\\Pi(?![a-zA-Z])/g, 'Π')
    .replace(/\\Sigma(?![a-zA-Z])/g, 'Σ')
    .replace(/\\Phi(?![a-zA-Z])/g, 'Φ')
    .replace(/\\Psi(?![a-zA-Z])/g, 'Ψ')
    .replace(/\\Omega(?![a-zA-Z])/g, 'Ω')
    .replace(/\\rightarrow(?![a-zA-Z])/g, '→')
    .replace(/\\to(?![a-zA-Z])/g, '→')
    .replace(/\\leftarrow(?![a-zA-Z])/g, '←')
    .replace(/\\leftrightarrow(?![a-zA-Z])/g, '↔')
    .replace(/\\Rightarrow(?![a-zA-Z])/g, '⇒')
    .replace(/\\implies(?![a-zA-Z])/g, '⇒')
    .replace(/\\Leftarrow(?![a-zA-Z])/g, '⇐')
    .replace(/\\iff(?![a-zA-Z])/g, '⇔')
    .replace(/\\mapsto(?![a-zA-Z])/g, '↦')
    .replace(/\\leq?(?![a-zA-Z])/g, '≤')
    .replace(/\\geq?(?![a-zA-Z])/g, '≥')
    .replace(/\\neq?(?![a-zA-Z])/g, '≠')
    .replace(/\\approx(?![a-zA-Z])/g, '≈')
    .replace(/\\equiv(?![a-zA-Z])/g, '≡')
    .replace(/\\sim(?![a-zA-Z])/g, '∼')
    .replace(/\\propto(?![a-zA-Z])/g, '∝')
    .replace(/\\pm(?![a-zA-Z])/g, '±')
    .replace(/\\mp(?![a-zA-Z])/g, '∓')
    .replace(/\\times(?![a-zA-Z])/g, '×')
    .replace(/\\div(?![a-zA-Z])/g, '÷')
    .replace(/\\cdot(?![a-zA-Z])/g, '·')
    .replace(/\\ast(?![a-zA-Z])/g, '∗')
    .replace(/\\circ(?![a-zA-Z])/g, '∘')
    .replace(/\\infty(?![a-zA-Z])/g, '∞')
    .replace(/\\partial(?![a-zA-Z])/g, '∂')
    .replace(/\\nabla(?![a-zA-Z])/g, '∇')
    .replace(/\\forall(?![a-zA-Z])/g, '∀')
    .replace(/\\exists(?![a-zA-Z])/g, '∃')
    .replace(/\\nexists(?![a-zA-Z])/g, '∄')
    .replace(/\\notin(?![a-zA-Z])/g, '∉')
    .replace(/\\in(?![a-zA-Z])/g, '∈')
    .replace(/\\subseteq(?![a-zA-Z])/g, '⊆')
    .replace(/\\subset(?![a-zA-Z])/g, '⊂')
    .replace(/\\cup(?![a-zA-Z])/g, '∪')
    .replace(/\\cap(?![a-zA-Z])/g, '∩')
    .replace(/\\emptyset(?![a-zA-Z])/g, '∅')
    .replace(/\\sum(?![a-zA-Z])/g, '∑')
    .replace(/\\prod(?![a-zA-Z])/g, '∏')
    .replace(/\\int(?![a-zA-Z])/g, '∫')
    .replace(/\\oint(?![a-zA-Z])/g, '∮')
    .replace(/\\lim(?![a-zA-Z])/g, 'lim')
    .replace(/\\log(?![a-zA-Z])/g, 'log')
    .replace(/\\ln(?![a-zA-Z])/g, 'ln')
    .replace(/\\sin(?![a-zA-Z])/g, 'sin')
    .replace(/\\cos(?![a-zA-Z])/g, 'cos')
    .replace(/\\tan(?![a-zA-Z])/g, 'tan')
    .replace(/\\quad/g, '  ')
    .replace(/\\qquad/g, '    ')
    .replace(/\\(?:,|;|!)/g, ' ')
    .replace(/\\left[.|([\]{}]?/g, '')
    .replace(/\\right[.|([\]{}]?/g, '')
    .replace(/\\begin\{[a-zA-Z*]+\}/g, '')
    .replace(/\\end\{[a-zA-Z*]+\}/g, '');

  // 6. Sqrt
  while (/\\sqrt\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, (_, inner) => {
      const it = inner.trim();
      return (it.length === 1 && !/[ +-]/.test(it)) ? `√${it}` : `√(${it})`;
    });
  }

  // 7. Superscripts & Subscripts
  s = s.replace(/\^\{([^{}]+)\}/g, (_, c) => toSuperscript(c));
  s = s.replace(/\^([0-9a-zA-Z+-=()])/g, (_, c) => toSuperscript(c));
  s = s.replace(/_\{([^{}]+)\}/g, (_, c) => toSubscript(c));
  s = s.replace(/_([0-9a-zA-Z+-=()])/g, (_, c) => toSubscript(c));

  // 8. Fractions
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
      const numTrim = num.trim();
      const denTrim = den.trim();
      const n = (numTrim.length === 1 || !/[ +-]/.test(numTrim)) ? numTrim : `(${numTrim})`;
      const d = (denTrim.length === 1 || !/[ +-]/.test(denTrim)) ? denTrim : `(${denTrim})`;
      return `${n}/${d}`;
    });
  }

  // 9. Clean braces and excess horizontal whitespace
  s = s.replace(/[{}]/g, '');
  s = s.replace(/[ \t]+/g, ' ');

  return s;
}
