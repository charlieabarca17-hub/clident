import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Las barandas de CLAUDE.md §10 y §11, expresadas como error de build.
//
// No son preferencias de estilo: son el aislamiento de Prisma y la prohibición de SQL
// interpolado. Si alguna vez estorban, la respuesta NO es apagarlas — es que el archivo
// que las viola está en el lugar equivocado.

// Una prohibición que solo mira `db.$queryRaw` no prohíbe nada: `db["$queryRaw"]` y
// `const { $queryRaw } = db` llegan a la misma función y ninguna de las dos se ve
// sospechosa en una revisión. Una regla evadible con un cambio de sintaxis es peor que
// ninguna, porque el diff pasa en verde y todos suponen que la baranda funcionó.
//
// De ahí que cada nombre prohibido se cubra en sus cuatro formas.
function formasDeAlcanzar(nombres) {
  return [
    // db.$queryRaw`...`
    `MemberExpression[property.name=${nombres}]`,
    // db["$queryRaw"](...)  — y db?.["$queryRaw"]
    `MemberExpression[computed=true][property.value=${nombres}]`,
    // const { $queryRaw } = db        /  function f({ $queryRaw }) {}
    `ObjectPattern > Property[key.name=${nombres}]`,
    // const { ["$queryRaw"]: q } = db /  const { "$queryRaw": q } = db
    `ObjectPattern > Property[key.value=${nombres}]`,
  ];
}

const NOMBRES_UNSAFE = "/^\\$(queryRawUnsafe|executeRawUnsafe)$/";
const NOMBRES_RAW = "/^\\$(queryRaw|executeRaw)$/";

const MENSAJE_UNSAFE =
  "$queryRawUnsafe y $executeRawUnsafe estan PROHIBIDAS sin excepcion (CLAUDE.md §10): " +
  "interpolan strings, o sea que son inyeccion SQL esperando ocurrir. Usa la variante " +
  "parametrizada ($queryRaw) dentro de src/server/db/raw/.";

const MENSAJE_RAW =
  "$queryRaw y $executeRaw solo se permiten dentro de src/server/db/raw/ (CLAUDE.md §10), " +
  "un archivo por consulta y con un comentario que explique por que debe ser cruda. Asi " +
  "`git log src/server/db/raw/` es la historia completa del SQL crudo del proyecto.";

const MENSAJE_PRISMA =
  "Solo src/server/db/** puede importar Prisma (CLAUDE.md §11). Un componente de pagina " +
  "que quiera datos llama a un repositorio, nunca a Prisma. El repositorio recibe " +
  "ctx: TenantContext y filtra por clinicaId; ese filtro es lo que se pierde aca.";

const prohibir = (nombres, message) =>
  formasDeAlcanzar(nombres).map((selector) => ({ selector, message }));

const PROHIBIR_UNSAFE = prohibir(NOMBRES_UNSAFE, MENSAJE_UNSAFE);
const PROHIBIR_RAW = prohibir(NOMBRES_RAW, MENSAJE_RAW);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    name: "clident/barandas",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@prisma/client", message: MENSAJE_PRISMA }],
          patterns: [
            {
              group: ["@prisma/client/*", ".prisma/client", ".prisma/client/*"],
              message: MENSAJE_PRISMA,
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...PROHIBIR_UNSAFE, ...PROHIBIR_RAW],
    },
  },

  // src/server/db/** es el unico consumidor de Prisma (ARQUITECTURA.md §2).
  {
    name: "clident/excepcion-prisma",
    files: ["src/server/db/**"],
    rules: { "no-restricted-imports": "off" },
  },

  // src/server/db/raw/ es el unico lugar con SQL crudo — pero las variantes Unsafe
  // siguen prohibidas ACA TAMBIEN, en sus cuatro formas. La lista se vuelve a declarar
  // entera a proposito: en flat config, redeclarar una regla reemplaza sus opciones, asi
  // que omitir los selectores Unsafe los habilitaria en silencio justo en la carpeta del
  // SQL crudo.
  {
    name: "clident/excepcion-raw",
    files: ["src/server/db/raw/**"],
    rules: {
      "no-restricted-syntax": ["error", ...PROHIBIR_UNSAFE],
    },
  },
]);

export default eslintConfig;
