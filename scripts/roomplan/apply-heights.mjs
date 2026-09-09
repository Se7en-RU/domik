import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const specPath = path.join(root, "lib/house.json");
const reviewPath = path.join(root, "measurements/manual/height-review.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
const value = (id) => review.decisions.find((d) => d.id === id).accepted;
spec.parameters.groundHeight = value("ground-height-roomplan-2026-09-08");
spec.parameters.upperHeight = value("upper-height-roomplan-2026-09-08");
spec.garage.ceilingHeight = value("garage-height-roomplan-2026-09-08");
const openingDecision = review.decisions.find(
  (d) => d.id === "opening-heights-roomplan-2026-09-08",
);
for (const wall of spec.walls)
  for (const opening of wall.openings ?? []) {
    const measured = openingDecision.openings[opening.id];
    if (!measured) continue;
    opening.height = measured.height;
    opening.sill = measured.sill;
    opening.sourceRefs = [
      ...new Set([...(opening.sourceRefs ?? []), `height-review:${measured.scan}`]),
    ];
  }
spec.revision = "2026-09-08-roomplan-heights";
const source = spec.sources.find((s) => s.id === "roomplan-audit");
source.note =
  "Архитектурное сопоставление RoomPlan JSON; по review 08.09.2026 базовые высоты и однозначно сопоставленные высоты проёмов приняты по сканам.";
const assumptions = spec.assumptions;
assumptions.find((a) => a.id === "ceiling").text =
  "Базовые высоты по RoomPlan review 08.09.2026: первый этаж 3,03 м (медиана однозначных высоких стен), высокая часть второго 3,045 м (медиана детской, комнаты, спальни и ванной). Смешанный коридор/лестница и локальные низкие участки не использованы для общей отметки. Старые 3,22 м и 2,97 м заменены этим решением владельца; technicalUpperHeight 3,45 м сохраняется только для расчёта скатов.";
assumptions.find((a) => a.id === "garage-dimensions").text =
  "Габариты и высота гаража по RoomPlan, принятому владельцем при review 08.09.2026: ширина около 6,36 м, боковые стены 6,38 / 7,13 м, проём ворот 4,74 м, основные стены 2,927 м. Участок 2,670 м сохранён как локальный перепад. Высота ворот 2,70 м сохранена отдельно: RoomPlan не распознал ворота как поверхность.";
assumptions.find((a) => a.id === "openings").text +=
  " При review однозначно сопоставленные высоты и низы окон приняты по RoomPlan; F2-WIN04 оставлен REVIEW REQUIRED из-за противоречивых вертикальных значений 1,335/1,448 м и низов 75/524 мм.";
assumptions.push({
  id: "roomplan-heights",
  title: "Высоты по RoomPlan",
  text: "По решению владельца 08.09.2026 значения высот принимаются из сканов. Общие отметки сведены медианой независимых однозначных комнат; низкие участки стен, скаты и смешанные области не усредняются с высокими стенами. Шесть однозначно сопоставленных окон обновлены; противоречивый F2-WIN04 и ворота без отдельной поверхности остаются REVIEW REQUIRED/KEPT.",
});
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
console.log(
  `Applied RoomPlan heights: ground ${spec.parameters.groundHeight}, upper ${spec.parameters.upperHeight}, garage ${spec.garage.ceilingHeight}`,
);
