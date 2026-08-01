import { defineConfig, configDefaults } from "vitest/config";

// Les worktrees d'agents vivent SOUS le dépôt (.claude/worktrees/<nom>/) et contiennent une copie
// complète de src/ — donc de toute la suite. Sans exclusion, vitest découvre chaque test 3 fois et
// tout compte triple : le 31/07 la sortie annonçait « 27 failed » pour 9 échecs réels, sur des
// copies figées à un ancien commit qui échouaient pour des raisons déjà corrigées ailleurs.
// Une sortie qu'on ne peut pas lire est une sortie qu'on cesse de lire.
//
// Exclusion et non suppression : ces worktrees appartiennent à des sessions d'agents en cours
// (`git worktree list`), les effacer détruirait un travail qui n'est pas le nôtre.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
});
