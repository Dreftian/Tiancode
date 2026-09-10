// The built-in skill catalogue lives in @tiancode-ai/core, generated from the skills/
// directory by backend/tools/script/generate-builtin-skills.ts.
//
// It used to be transcribed by hand here as well. The two copies drifted 41 skills apart,
// which meant the set of available skills depended on which code path had loaded them: this
// registry backs the tiancode skill state, while core's backs the SkillPlugin. Re-exporting
// keeps both paths on one catalogue.
export { builtinAgentSkills } from "@tiancode-ai/core/plugin/skill/builtin"
