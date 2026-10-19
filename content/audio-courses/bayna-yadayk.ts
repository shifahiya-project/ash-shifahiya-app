// Lesson numbers and order are supplied by the course owner, not playlist indices.
export type BaynaYadaykLesson = {
  readonly number: number;
  readonly videoId: string | null;
  readonly part?: number;
};

export type BaynaYadaykSection = {
  readonly title: string;
  readonly totalLessons: number;
  readonly playlistId: string;
  readonly lessons: readonly BaynaYadaykLesson[];
};

export const baynaYadaykVolumeTwo = {
  title: "Том 2",
  totalLessons: 30,
  playlistId: "PLu3huSKRjCrDSna3IAYto2-2Z0eQfiG18",
  lessons: [
    { number: 1, videoId: "i78_gtES0hY" },
    { number: 2, videoId: "DtXAcDZ74is" },
    { number: 3, videoId: "Gr1xbST8P_o" },
    { number: 4, videoId: "lDfOZjv1Fg4" },
    { number: 5, videoId: "IeHQXebck20" },
    { number: 6, videoId: "uTS6uXhyCn8" },
    { number: 7, videoId: "k03KHrWSMGY" },
    { number: 8, videoId: "gJlVQ8fxj38" },
    { number: 9, videoId: "gAEr50iSZfk" },
    { number: 10, videoId: "GZUfyeqHDTI" },
    { number: 11, videoId: "WFGFGwKk9Ys" },
    { number: 12, videoId: "JJrl7oRALsI" },
    { number: 13, videoId: "-q9bSlwSx1A" },
    { number: 14, videoId: "FH-QLrwJhB4" },
    { number: 15, videoId: "Rvp3xeV2wvY" },
    { number: 16, videoId: "dkAJAdw-tXw" },
    { number: 17, videoId: "5rrMJRUl17E" },
    { number: 18, videoId: "oPQDF-8taZM" },
    { number: 19, videoId: "AXqH5P17JA0" },
    { number: 20, videoId: "A8BEuFSYwA8" },
    { number: 21, videoId: "7eIQuVF1Sn0" },
    { number: 22, videoId: "mMqn2ua-ozs" },
    { number: 23, videoId: "0FFbljoZtCk" },
    { number: 24, videoId: "q9ASZF4PzfE" },
    { number: 25, videoId: "G9XWcp6h91Q" },
    { number: 26, videoId: "zH2fWS-Y4Fg" },
    { number: 27, videoId: "oA9bjoJEZU4" },
    { number: 28, videoId: "cWTf4BdfyrQ" },
    { number: 29, videoId: "6bvnNLnf51s" },
    { number: 30, videoId: "fVvbFfbWPqI" },
  ],
} as const satisfies BaynaYadaykSection;

export const baynaYadaykVolumeThreePartOne = {
  title: "Том 3 · Часть 1",
  totalLessons: 36,
  playlistId: "PLu3huSKRjCrBkgv1uhYBastQf26rZyrUM",
  lessons: [
    { number: 1, videoId: "KgGNodTQ2dg" },
    { number: 2, videoId: "wAPLxLuLSYE" },
    { number: 3, videoId: "cu1paojji8Y" },
    { number: 4, videoId: "RldK_1BAiNo" },
    { number: 5, videoId: "D4fmM_9culc" },
    { number: 6, videoId: "UzrnZr4EL3A" },
    { number: 7, videoId: "62blX_WJEjE" },
    { number: 8, videoId: "RdQ8zF_FvGc" },
    { number: 9, videoId: "T6rPGUD2hOI" },
    { number: 10, videoId: "pLgKn2Z-pMg" },
    { number: 11, videoId: "yM2PgzaRzAA" },
    { number: 12, videoId: "koZLANg4xmU" },
    { number: 13, videoId: "odqx-EwXdjs" },
    { number: 14, videoId: "bn5nZIFeO9Q" },
    { number: 15, videoId: "q8L0UaBRo28" },
    { number: 16, videoId: "6fDwYi_DuBc" },
    { number: 17, videoId: "aTtJvnt9FKk" },
    { number: 18, videoId: "yQluCSYgGGw" },
    { number: 19, videoId: "-_1Me9WLYXM" },
    { number: 20, videoId: "3VXY6ASeeFQ" },
    { number: 21, videoId: "59kK8v9PODk" },
    { number: 22, videoId: "PVxo-fVCBxY" },
    { number: 23, videoId: "_6MewrbOCPc" },
    { number: 24, videoId: "zsMaNEeaxXs" },
    { number: 25, videoId: "wv6K5S-FO4Q" },
    { number: 26, videoId: "YnBHh8kvryM" },
    { number: 27, videoId: null },
    { number: 28, videoId: "vyf4LpyWYZU" },
    { number: 29, videoId: "S0RxWs-Jbcs" },
    { number: 30, videoId: "4evEKE5XcTk" },
    { number: 31, part: 1, videoId: "z40PKxsY8yA" },
    { number: 31, part: 2, videoId: "5VBBkdocJLk" },
    { number: 32, videoId: "3QpzJGUJ36U" },
    { number: 33, videoId: null },
    { number: 34, videoId: "-zy_WhQOzJA" },
    { number: 35, videoId: "c0nbrEwwnYs" },
    { number: 36, videoId: "3RySJY1QdFA" },
  ],
} as const satisfies BaynaYadaykSection;

export const baynaYadaykVolumeThreePartTwo = {
  title: "Том 3 · Часть 2",
  totalLessons: 23,
  playlistId: "PLu3huSKRjCrBkgv1uhYBastQf26rZyrUM",
  lessons: [
    { number: 1, videoId: "MU86sM_E870" },
    { number: 2, videoId: "2VVphkuAy1c" },
    { number: 3, videoId: "M7m7SGSzYTI" },
    { number: 4, videoId: "Sv6tc5YnbUI" },
    { number: 5, videoId: "AqqKkiGnp3s" },
    { number: 6, videoId: "gdGO0bnnD_E" },
    { number: 7, videoId: "BpeMM_IkR-M" },
    { number: 8, videoId: "oi2C3eNh08k" },
    { number: 9, videoId: "zIkXa9iUntU" },
    { number: 10, videoId: "BNwT_hpbyw4" },
    { number: 11, videoId: "55Onq8HU_Vs" },
    { number: 12, videoId: "UUAYo-mBzQs" },
    { number: 13, videoId: "OzRMdd_8auQ" },
    { number: 14, videoId: "CEOc5H_JLro" },
    { number: 15, videoId: "KKq3mGak6p8" },
    { number: 16, videoId: "bT3Y7_sE2hc" },
    { number: 17, videoId: "3L3n3oOT59c" },
    { number: 18, videoId: "gHOY9bcJIcw" },
    { number: 19, videoId: null },
    { number: 20, videoId: null },
    { number: 21, videoId: "H_ScrwfJ4Ek" },
    { number: 22, videoId: "biojU8nHHzg" },
    { number: 23, videoId: "nBB8p8qrNyk" },
  ],
} as const satisfies BaynaYadaykSection;

export const baynaYadaykSections: readonly BaynaYadaykSection[] = [
  baynaYadaykVolumeTwo,
  baynaYadaykVolumeThreePartOne,
  baynaYadaykVolumeThreePartTwo,
];
