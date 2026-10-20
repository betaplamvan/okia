// File sinh tự động bởi scripts/gen-maps.mjs từ shared/maps/maps.json — KHÔNG sửa tay.
import type { MapSource } from "./maps";

export const MAP_SOURCES: readonly MapSource[] = [
  {
    "id": "5x5",
    "name": {
      "vi": "5×5",
      "en": "5×5"
    },
    "kind": "rect",
    "cells": [
      "#####",
      "#####",
      "#####",
      "#####",
      "#####"
    ]
  },
  {
    "id": "7x7",
    "name": {
      "vi": "7×7",
      "en": "7×7"
    },
    "kind": "rect",
    "cells": [
      "#######",
      "#######",
      "#######",
      "#######",
      "#######",
      "#######",
      "#######"
    ]
  },
  {
    "id": "khung-long",
    "name": {
      "vi": "Khủng long",
      "en": "Dinosaur"
    },
    "kind": "shape",
    "cells": [
      "......####",
      ".....##.##",
      ".....#####",
      "#....###..",
      "##..#####.",
      ".#######..",
      "..######..",
      "..##..##.."
    ]
  },
  {
    "id": "bong-hoa",
    "name": {
      "vi": "Bông hoa",
      "en": "Flower"
    },
    "kind": "shape",
    "cells": [
      "..##.##..",
      ".#######.",
      "###...###",
      ".##...##.",
      "###...###",
      ".#######.",
      "..#####..",
      "....#....",
      "..###...."
    ]
  },
  {
    "id": "bach-tuoc",
    "name": {
      "vi": "Bạch tuộc",
      "en": "Octopus"
    },
    "kind": "shape",
    "cells": [
      ".#####.",
      "#######",
      "#.###.#",
      "#######",
      "#######",
      "#.#.#.#",
      "#.#.#.#",
      "###.###"
    ]
  },
  {
    "id": "xuong-rong",
    "name": {
      "vi": "Xương rồng",
      "en": "Cactus"
    },
    "kind": "shape",
    "cells": [
      "...###...",
      "...###...",
      "#..###..#",
      "##.###.##",
      ".#######.",
      "...###...",
      "...###...",
      ".#######.",
      "..#####.."
    ]
  },
  {
    "id": "con-ma",
    "name": {
      "vi": "Con ma",
      "en": "Ghost"
    },
    "kind": "shape",
    "cells": [
      ".#####.",
      "#######",
      "#..#..#",
      "#######",
      "#######",
      "#######",
      "##.#.##"
    ]
  },
  {
    "id": "3x3",
    "name": {
      "vi": "3×3",
      "en": "3×3"
    },
    "kind": "rect",
    "hidden": true,
    "cells": [
      "###",
      "###",
      "###"
    ]
  }
];
