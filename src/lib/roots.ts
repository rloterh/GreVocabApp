import type { VocabWord } from "@/types";
import { normalizeWord } from "@/lib/stem";

/**
 * Root families — curated, not inferred.
 *
 * The tempting implementation clusters words by shared prefix, and it is
 * wrong in a way that matters. In this corpus *commend*, *commence*,
 * *commemorate* and *commensurate* all share five letters and come from four
 * different roots (*mandare*, *initiare*, *memor*, *mensura*); *approbation*,
 * *appropriate* and *approximate* share five more and come from three. A
 * vocabulary app that asserts a false etymology is not being helpful, it is
 * teaching a mistake, and the user has no way to know.
 *
 * So membership is listed explicitly, one word at a time, and a family is the
 * intersection of that list with whatever the user has loaded. That trades
 * coverage for being right — roughly one word in six gets a family, and every
 * one of them is a real relation.
 *
 * Adding a root: give its meaning, its origin, and only words you would defend
 * individually. `roots.test.ts` checks that each member actually contains a
 * recognisable form of its root, which catches typos but cannot check
 * etymology — that part is on whoever adds the entry.
 */

export interface RootFamily {
  /** The root as a learner would see it written, e.g. "loqu / locut". */
  root: string;
  meaning: string;
  origin: "Latin" | "Greek" | "Greek and Latin";
  /** Every member, lowercase. The family is these, not a pattern. */
  members: string[];
}

export const ROOT_FAMILIES: RootFamily[] = [
  // --- Speech, writing, naming ---------------------------------------------
  { root: "loqu / locut", meaning: "to speak", origin: "Latin",
    members: ["loquacious", "eloquent", "grandiloquent", "magniloquent", "soliloquy", "colloquial", "obloquy", "circumlocution", "interlocutor", "elocution", "ventriloquist"] },
  { root: "dict", meaning: "to say, to declare", origin: "Latin",
    members: ["dictum", "edict", "interdict", "malediction", "benediction", "predicate", "indict", "verdict", "dictate", "diction", "valedictory"] },
  { root: "voc / vok", meaning: "to call, voice", origin: "Latin",
    members: ["equivocate", "irrevocable", "evocative", "provoke", "revoke", "vociferous", "invoke", "convoke", "avocation", "advocate"] },
  { root: "garru", meaning: "to chatter", origin: "Latin", members: ["garrulous", "garrulity"] },
  { root: "verb", meaning: "word", origin: "Latin",
    members: ["verbose", "verbatim", "verbiage", "proverb", "verbal"] },
  { root: "onym / nom", meaning: "name", origin: "Greek",
    members: ["anonymous", "pseudonym", "eponymous", "synonym", "antonym", "misnomer", "nomenclature", "acronym"] },
  { root: "graph / gram", meaning: "to write", origin: "Greek",
    members: ["epigraph", "epigram", "calligraphy", "graphic", "monograph", "anagram", "cryptogram", "hagiography"] },
  { root: "scrib / script", meaning: "to write", origin: "Latin",
    members: ["proscribe", "prescribe", "circumscribe", "inscribe", "conscription", "manuscript", "transcribe", "ascribe", "scribble"] },

  // --- Belief, knowing, seeing ---------------------------------------------
  { root: "cred", meaning: "to believe, to trust", origin: "Latin",
    members: ["credulous", "incredulous", "credible", "credence", "creed", "credo", "accreditation", "miscreant"] },
  { root: "fid", meaning: "faith, trust", origin: "Latin",
    members: ["perfidious", "fidelity", "infidel", "confide", "diffident", "affidavit", "bona fide"] },
  { root: "sci", meaning: "to know", origin: "Latin",
    members: ["prescient", "omniscient", "conscientious", "nescient", "conscience"] },
  { root: "gno / cogn", meaning: "to know", origin: "Greek and Latin",
    // Greek gnosis and Latin cognoscere are the same Indo-European root, which
    // is why both spellings mean knowing. Worth saying rather than splitting.
    members: ["agnostic", "prognosis", "diagnose", "cognizant", "incognito", "recognize", "cognition"] },
  { root: "spec / spic", meaning: "to look, to see", origin: "Latin",
    members: ["circumspect", "perspicacious", "conspicuous", "auspicious", "specious", "introspection", "retrospect", "despicable", "spectacle", "perspective"] },
  { root: "vid / vis", meaning: "to see", origin: "Latin",
    members: ["evident", "provident", "improvident", "vista", "visage", "envisage", "invidious", "vision"] },
  { root: "phan / phen", meaning: "to show, to appear", origin: "Greek",
    members: ["sycophant", "epiphany", "diaphanous", "phenomenon", "fantasy"] },

  // --- Feeling and disposition ----------------------------------------------
  { root: "path", meaning: "feeling, suffering", origin: "Greek",
    members: ["apathy", "empathy", "antipathy", "sympathy", "pathos", "pathetic", "pathology", "sociopath"] },
  { root: "anim", meaning: "mind, spirit, breath", origin: "Latin",
    members: ["magnanimous", "pusillanimous", "equanimity", "unanimous", "animosity", "animus", "inanimate", "animated"] },
  { root: "cord / cour", meaning: "heart", origin: "Latin",
    members: ["concord", "discord", "accord", "cordial", "courage", "discourage"] },
  { root: "phil", meaning: "loving", origin: "Greek",
    members: ["philanthropy", "bibliophile", "philology", "philanderer", "francophile"] },
  { root: "mis / miso", meaning: "hatred", origin: "Greek",
    members: ["misanthrope", "misogyny", "misandry"] },

  // --- Doing, making, carrying ---------------------------------------------
  { root: "fac / fect / fic", meaning: "to make, to do", origin: "Latin",
    members: ["efficacious", "facile", "factitious", "artifice", "munificent", "beneficent", "maleficent", "prolific", "soporific", "edifice"] },
  { root: "ject", meaning: "to throw", origin: "Latin",
    members: ["abject", "conjecture", "dejected", "interject", "projection", "trajectory", "eject"] },
  { root: "port", meaning: "to carry", origin: "Latin",
    members: ["comportment", "deportment", "importune", "purport", "portable", "rapport", "disport"] },
  { root: "duc / duct", meaning: "to lead", origin: "Latin",
    members: ["conduce", "induce", "adduce", "traduce", "abduct", "deduce", "seduce", "ductile"] },
  { root: "pel / puls", meaning: "to drive, to push", origin: "Latin",
    members: ["compel", "repel", "impel", "expel", "propel", "compulsion", "repulsive", "pulsate"] },
  { root: "tract", meaning: "to pull, to draw", origin: "Latin",
    members: ["intractable", "protract", "retract", "detract", "abstract", "tractable", "distract"] },
  { root: "vert / vers", meaning: "to turn", origin: "Latin",
    members: ["averse", "aversion", "inadvertent", "subvert", "controvert", "incontrovertible", "diverse", "perverse", "traverse", "versatile"] },
  { root: "flu / flux", meaning: "to flow", origin: "Latin",
    members: ["mellifluous", "confluence", "effluent", "superfluous", "influx", "fluctuate", "fluent"] },

  // --- Size, quantity, fullness --------------------------------------------
  { root: "magn", meaning: "great", origin: "Latin",
    members: ["magnitude", "magnify", "magnate", "magnanimous", "magniloquent"] },
  { root: "plen / plet", meaning: "full", origin: "Latin",
    members: ["replete", "plenary", "plethora", "deplete", "complement", "plenitude"] },
  { root: "omni", meaning: "all", origin: "Latin",
    members: ["omniscient", "omnipotent", "omnivorous", "omnipresent"] },
  { root: "pan", meaning: "all", origin: "Greek",
    members: ["panacea", "panoply", "pandemic", "panorama", "pantheon"] },
  { root: "greg", meaning: "flock, herd", origin: "Latin",
    members: ["gregarious", "egregious", "congregate", "segregate", "aggregate"] },

  // --- Time and order -------------------------------------------------------
  { root: "tempor", meaning: "time", origin: "Latin",
    members: ["temporal", "contemporary", "extemporaneous", "temporize", "temporary"] },
  { root: "chron", meaning: "time", origin: "Greek",
    members: ["anachronism", "chronic", "chronology", "synchronous", "chronicle"] },
  { root: "prim / prin", meaning: "first", origin: "Latin",
    members: ["primordial", "primeval", "primacy", "pristine", "principal"] },
  { root: "nov", meaning: "new", origin: "Latin",
    members: ["novice", "innovate", "novel", "renovate", "nouveau"] },
  { root: "sen", meaning: "old", origin: "Latin",
    members: ["senescence", "senile", "senior", "senate"] },

  // --- Life and death -------------------------------------------------------
  { root: "viv / vit", meaning: "life, to live", origin: "Latin",
    members: ["vivacious", "convivial", "vivid", "revive", "viable", "vital", "vitality"] },
  { root: "mort", meaning: "death", origin: "Latin",
    members: ["mortify", "moribund", "mortal", "immortal", "mortuary", "amortize"] },
  { root: "bio", meaning: "life", origin: "Greek",
    members: ["symbiosis", "biography", "biopsy", "antibiotic"] },

  // --- Good, bad, blame -----------------------------------------------------
  { root: "ben / bon", meaning: "good, well", origin: "Latin",
    members: ["benevolent", "benign", "benediction", "beneficent", "benefactor", "bonhomie", "bonanza"] },
  { root: "mal", meaning: "bad, badly", origin: "Latin",
    members: ["malevolent", "malign", "malediction", "malfeasance", "malinger", "malaise", "malcontent", "malady"] },
  { root: "prob", meaning: "to test, to prove", origin: "Latin",
    members: ["probity", "approbation", "opprobrium", "reprobate", "probe"] },
  { root: "culp", meaning: "blame, fault", origin: "Latin",
    members: ["culpable", "exculpate", "inculpate", "mea culpa"] },
  { root: "crimin", meaning: "accusation, charge", origin: "Latin",
    members: ["recriminate", "incriminate", "criminal", "discriminate"] },

  // --- Power, rule, law -----------------------------------------------------
  { root: "arch", meaning: "ruler, chief", origin: "Greek",
    members: ["anarchy", "oligarchy", "monarch", "patriarch", "hierarchy", "archetype", "matriarch"] },
  { root: "crat / cracy", meaning: "power, rule", origin: "Greek",
    members: ["autocrat", "plutocracy", "meritocracy", "bureaucracy", "technocrat", "democracy"] },
  { root: "poten", meaning: "power, able", origin: "Latin",
    members: ["potent", "impotent", "omnipotent", "potentate", "plenipotentiary"] },
  { root: "jur / jud", meaning: "law, to judge", origin: "Latin",
    members: ["adjudicate", "perjury", "jurisprudence", "judicious", "injudicious", "abjure", "adjure", "jurisdiction"] },
  { root: "leg / lex", meaning: "law", origin: "Latin",
    members: ["legitimate", "legislate", "legal", "lexicon"] },

  // --- Holding, binding, breaking ------------------------------------------
  { root: "ten / tain", meaning: "to hold", origin: "Latin",
    members: ["tenacious", "tenable", "untenable", "abstain", "sustain", "retentive", "pertinacious", "detain", "tenet"] },
  { root: "cap / cip", meaning: "to take, to seize", origin: "Latin",
    members: ["capacious", "incipient", "recipient", "susceptible", "captivate", "anticipate", "precipitate"] },
  { root: "string / strict", meaning: "to bind, to draw tight", origin: "Latin",
    members: ["astringent", "stringent", "constrict", "restrict", "stricture", "constrain"] },
  { root: "rupt", meaning: "to break", origin: "Latin",
    members: ["abrupt", "disrupt", "erupt", "corrupt", "rupture", "interrupt"] },
  { root: "sect / seg", meaning: "to cut", origin: "Latin",
    members: ["dissect", "bisect", "intersect", "segment", "sector"] },

  // --- Sound, voice, listening ----------------------------------------------
  { root: "son", meaning: "sound", origin: "Latin",
    members: ["dissonance", "consonance", "resonant", "sonorous", "sonnet", "unison"] },
  { root: "phon", meaning: "sound, voice", origin: "Greek",
    members: ["cacophony", "euphony", "symphony", "phonetic", "polyphony"] },
  { root: "aud", meaning: "to hear", origin: "Latin",
    members: ["audacious", "audible", "inaudible", "audition", "auditory"] },

  // --- Movement and place ---------------------------------------------------
  { root: "cede / cess", meaning: "to go, to yield", origin: "Latin",
    members: ["accede", "concede", "recede", "secede", "antecedent", "intercede", "accession", "incessant"] },
  { root: "grad / gress", meaning: "to step, to go", origin: "Latin",
    members: ["gradual", "digress", "transgress", "regress", "progress", "egress", "retrograde"] },
  { root: "ven / vent", meaning: "to come", origin: "Latin",
    members: ["adventitious", "convene", "intervene", "circumvent", "advent", "provenance", "contravene"] },
  { root: "err", meaning: "to wander, to stray", origin: "Latin",
    members: ["errant", "aberrant", "erratic", "erroneous", "err"] },
  { root: "peri", meaning: "around", origin: "Greek",
    members: ["peripatetic", "periphery", "perimeter", "peripheral", "periscope"] },

  // --- Light, fire, heat ----------------------------------------------------
  { root: "luc / lum", meaning: "light", origin: "Latin",
    members: ["lucid", "elucidate", "pellucid", "translucent", "luminous", "illuminate", "luminary"] },
  { root: "fer / ferv", meaning: "to boil, to glow", origin: "Latin",
    members: ["fervid", "fervor", "effervescent", "fervent"] },
  { root: "incend / cens", meaning: "to set on fire", origin: "Latin",
    // Two members and no more. `incentive` is *incinere*, to set the tune, and
    // `incinerate` is *cinis*, ashes — both were tried here and both were
    // wrong. A short true family beats a long plausible one.
    members: ["incendiary", "incense"] },

  // --- Turning inward ------------------------------------------------------
  { root: "solv / solut", meaning: "to loosen, to free", origin: "Latin",
    members: ["absolve", "dissolute", "resolute", "irresolute", "solvent", "dissolve"] },
  { root: "lig / lect", meaning: "to choose, to read, to gather", origin: "Latin",
    members: ["eclectic", "elect", "select", "collect", "intellect", "diligent", "negligent", "eligible"] },
  { root: "sequ / secut", meaning: "to follow", origin: "Latin",
    members: ["obsequious", "sequel", "consequence", "consecutive", "persecute", "non sequitur", "sequester"] },
  { root: "nasc / nat", meaning: "to be born", origin: "Latin",
    members: ["nascent", "renaissance", "innate", "nativity", "naive", "cognate"] },
  { root: "spir", meaning: "to breathe", origin: "Latin",
    members: ["aspire", "conspire", "expire", "inspire", "respire", "transpire", "spirited"] },
  { root: "voler / vol", meaning: "to wish, to will", origin: "Latin",
    members: ["benevolent", "malevolent", "volition", "voluntary", "volunteer"] },

  // --- A second pass, chosen because this corpus is thick with them ---------
  //
  // Each pair below is one a pattern matcher would merge and a dictionary
  // separates. They are the reason this file lists members instead.
  { root: "ped", meaning: "foot", origin: "Latin",
    // NOT pedant or pedagogy: those are Greek paid-, child. Same four letters,
    // unrelated words, and asserting otherwise would teach a mistake.
    members: ["impede", "expedite", "expeditious", "sesquipedalian", "pedigree", "pedestrian", "impediment"] },
  { root: "paed / ped", meaning: "child", origin: "Greek",
    members: ["pedagogy", "pedagogic", "pedant", "pedantic", "pedantry", "pediatric"] },
  { root: "lud / lus", meaning: "to play", origin: "Latin",
    // NOT preclude or recluse, which are claudere, to shut — see below.
    members: ["allude", "delude", "elude", "collude", "interlude", "prelude", "ludicrous", "delusion", "elusive", "illusory", "allusive", "collusion"] },
  { root: "clud / clus", meaning: "to shut", origin: "Latin",
    members: ["preclude", "seclude", "occlude", "recluse", "reclusive", "exclude", "include", "seclusion"] },
  { root: "sed / sid", meaning: "to sit, to settle", origin: "Latin",
    members: ["sedate", "sedentary", "sedulous", "supersede", "subside", "insidious", "assiduous", "residue", "residual", "preside", "dissident", "subsidize"] },
  { root: "equ", meaning: "equal, level", origin: "Latin",
    // NOT obsequious, which is sequi, to follow.
    members: ["equivocate", "equivocal", "unequivocal", "equilibrium", "equivalent", "equity", "inequity", "equitable", "equanimity", "adequate"] },
  { root: "plic / plex", meaning: "to fold", origin: "Latin",
    members: ["explicate", "implicit", "explicit", "duplicity", "duplicitous", "accomplice", "complicity", "complicate", "replicate", "implication", "perplex", "replica"] },
  { root: "rid / ris", meaning: "to laugh", origin: "Latin",
    members: ["deride", "derision", "ridicule", "ridiculous", "risible", "derisive"] },
  { root: "curr / curs", meaning: "to run", origin: "Latin",
    // NOT curt, curb or obscure, which merely start the same way.
    members: ["cursory", "concur", "recurrent", "concurrent", "precursor", "incur", "excursion", "discursive", "current", "occur"] },
  { root: "grat", meaning: "pleasing, thankful", origin: "Latin",
    // NOT migrate, integrate or denigrate.
    members: ["gratuity", "gratuitous", "ingratiate", "gratitude", "grateful", "ingrate", "gratify", "gracious"] },
  { root: "monit", meaning: "to warn", origin: "Latin",
    // NOT harmony, parsimony or acrimony, which are unrelated.
    members: ["admonish", "admonition", "remonstrate", "premonition", "monitor", "monument"] },
  { root: "volv / volut", meaning: "to roll", origin: "Latin",
    members: ["evolve", "convoluted", "devolve", "voluble", "involve", "revolution", "convolution"] },
  { root: "sat / satis", meaning: "enough, full", origin: "Latin",
    // NOT satire, which is satura, a medley.
    members: ["satiate", "sate", "insatiable", "satiety", "saturate", "satisfy"] },
  { root: "stat / stas", meaning: "to stand", origin: "Greek and Latin",
    members: ["static", "stationary", "statute", "statutory", "apostate", "ecstatic", "stasis", "status", "stature"] },
  { root: "van / vac", meaning: "empty", origin: "Latin",
    members: ["evanescent", "evanesce", "vanish", "vain", "vanity", "vacuous", "vacuity", "vacant", "vacuum"] },
  { root: "dem / demo", meaning: "people", origin: "Greek",
    // NOT condemn, demure or demise, which are Latin de- plus something else.
    members: ["demagogue", "demographic", "democracy", "pandemic", "endemic", "epidemic"] },
  { root: "log / logue", meaning: "word, reason, study", origin: "Greek",
    members: ["monologue", "prologue", "epilogue", "eulogize", "eulogy", "syllogism", "analogous", "analogy", "epistemology", "tautological", "dialogue"] },
  { root: "fus / fund", meaning: "to pour", origin: "Latin",
    // NOT fusty or fustian.
    members: ["profusion", "profuse", "effusive", "suffuse", "diffuse", "infusion", "refund", "foundry"] },
  { root: "neg", meaning: "to deny", origin: "Latin",
    members: ["renege", "abnegate", "negligent", "negligence", "negligible", "negate", "renegade", "negation"] },
  { root: "sum / sumpt", meaning: "to take up", origin: "Latin",
    // NOT consummate, which is summa, the highest.
    members: ["presume", "presumption", "presumptuous", "presumptive", "assume", "consume", "sumptuous", "resume"] },
  { root: "sanct / sacr", meaning: "holy", origin: "Latin",
    members: ["sacrosanct", "sanctimonious", "sanction", "sanctuary", "sacrilege", "sacrilegious", "sacrament", "consecrate"] },
  { root: "acr / acerb", meaning: "sharp, bitter", origin: "Latin",
    // NOT sacrament or simulacrum, which contain the letters and not the root.
    members: ["acrimony", "acrimonious", "acerbic", "exacerbate", "acrid", "acumen", "acute"] },
  { root: "tort / torqu", meaning: "to twist", origin: "Latin",
    members: ["tortuous", "contort", "distort", "extort", "retort", "torment", "torque"] },
  { root: "turb", meaning: "to disturb, confusion", origin: "Latin",
    members: ["perturb", "turbid", "turbulent", "imperturbable", "disturb", "turbulence"] },
  { root: "quies / quiet", meaning: "rest, still", origin: "Latin",
    members: ["quiescent", "acquiesce", "acquiescent", "requiem", "disquiet", "quietude"] },
  { root: "vinc / vict", meaning: "to conquer", origin: "Latin",
    members: ["evince", "convince", "invincible", "vanquish", "convict", "evict", "victory"] },
];

/**
 * Every family a word belongs to.
 *
 * A word can be in more than one: *magnanimous* is `magn` and `anim`, and
 * *benediction* is `ben` and `dict`. That is the interesting part, not an
 * error, so all of them come back.
 */
export function familiesOf(word: string): RootFamily[] {
  const key = normalizeWord(word);
  return ROOT_FAMILIES.filter((family) =>
    family.members.some((member) => normalizeWord(member) === key),
  );
}

export interface RelatedWord {
  word: string;
  /** Present when the user has this one loaded, so the UI can link to it. */
  id?: string;
}

/**
 * The rest of a word's families, restricted to what the user actually has.
 *
 * Showing *obloquy* beside *eloquent* to somebody who has never been given
 * *obloquy* is a vocabulary lesson they did not ask for in the middle of one
 * they did. Words present in the corpus come first and carry an id; the rest
 * are dropped.
 */
export function relativesOf(
  word: string,
  loaded: readonly VocabWord[],
): Array<{ family: RootFamily; words: RelatedWord[] }> {
  const known = new Map(loaded.map((w) => [normalizeWord(w.word), w.id]));
  const self = normalizeWord(word);

  return familiesOf(word)
    .map((family) => ({
      family,
      words: family.members
        .filter((member) => normalizeWord(member) !== self)
        .map((member) => ({ word: member, id: known.get(normalizeWord(member)) }))
        .filter((related) => related.id !== undefined),
    }))
    .filter((entry) => entry.words.length > 0);
}
