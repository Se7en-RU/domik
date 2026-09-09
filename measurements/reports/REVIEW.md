# Проверка RoomPlan и ручных замеров

Модель: 2026-09-09-roomplan-coupled-fit. Отчёт воспроизводится командой `npm run measurements:audit`.

Обработано файлов: 13. Геометрическая регистрация прошла пороги подбора: 9. SAFE TO APPLY сейчас: 0. Остальные изменения не применяются.

Применены ручные контроли в ревизии 2026-09-08-roomplan-controls:

- **F2-W07**: 0.38 → 0.405 м.
- **F1-W13-DIVIDER**: 0.1 → 0.13 м.
- **F1-W09**: 0.38 → 0.415 м.

Исходный diff сохранён в [before-apply.json](before-apply.json).

## Решения владельца при review

- **F1-GARAGE / width**: 6.85 → 6.36 м · SUPERSEDED. Ответ на вопрос о внутренней ширине 6,85 м в модели и около 6,36 м в RoomPlan. Остальные размеры гаража ещё на review.
- **F1-GARAGE / width**: 6.36 → 6.36 м · APPLIED. Относительная геометрия гаража по скану; абсолютная привязка к дому и высоты не подтверждены этим решением.
- **F1-GARAGE / shortLength**: 6.82 → 6.38 м · APPLIED. Относительная геометрия гаража по скану; абсолютная привязка к дому и высоты не подтверждены этим решением.
- **F1-GARAGE / longLength**: 7.87 → 7.13 м · APPLIED. Относительная геометрия гаража по скану; абсолютная привязка к дому и высоты не подтверждены этим решением.
- **F1-GARAGE / gateWidth**: 5.20 → 4.74 м · APPLIED. Относительная геометрия гаража по скану; абсолютная привязка к дому и высоты не подтверждены этим решением.
- **F1-GARAGE/GARAGE-W05 / rightEdgeX**: 9.42 → 9.36 м · APPLIED. Выступ стены сохраняет координату RoomPlan; старая грань дома не сдвигается.
- **GARAGE-W05 / rightEdgeX**: 9.36 → 9.42 м · APPLIED. Сдвинут только генерируемый участок GARAGE-W05; восьмиточечный контур гаража и сканные размеры не изменены.

## Ручные контрольные точки

| Стена | Было, м | Замер, м | Δ, м | Решение |
|---|---:|---:|---:|---|
| F2-W07 | 0.405 | 0.405 | 0 | IGNORE |
| F1-W13-DIVIDER | 0.13 | 0.13 | 0 | IGNORE |
| F1-W09 | 0.415 | 0.415 | 0 | IGNORE |

- **F2-W07**: Ручной контроль; южная грань 4.57 м сохраняется; связанные комнаты заканчиваются на 4.165 м.
- **F1-W13-DIVIDER**: Ручной контроль и торец в скане лестницы. Верхний марш пересчитывается; пол кладовой исключает перегородку.
- **F1-W09**: Ручной контроль; южная грань 4.57 м сохраняется; связанные комнаты заканчиваются на 4.155 м.

## Регистрация всех сканов

Названия файлов не участвуют в подборе. story=0 во всех текущих файлах — локальный индекс, а не номер этажа дома. Одинаковая геометрия не считается независимым повтором. Ошибка подбора — метрика согласования с моделью, не оценка точности прибора.

| Файл | Гипотеза | Статус | Ошибка, м |
|---|---|---|---:|
| бойлер.json | F1-BOILER | REVIEW REQUIRED | 0.128 |
| ванна.json | F2-BATH | MATCHED | 0.024 |
| гараж.json | F1-GARAGE | MATCHED | 0.112 |
| гардероб.json | F2-DRESS | MATCHED | 0.050 |
| детская.json | F2-CHILD | MATCHED | 0.048 |
| комната-2этаж.json | F2-ROOM | MATCHED | 0.086 |
| коридор-2этаж.json | F2-HALL+F2-STAIR | MATCHED | 0.050 |
| коридор.json | F1-OFFICE | MATCHED | 0.046 |
| кухня-гостиная.json | F1-LIVING+F1-KITCHEN | MATCHED | 0.082 |
| лестница.json | F2-HALL+F2-STAIR | REVIEW REQUIRED | 0.245 |
| спальня.json | F2-BED | MATCHED | 0.053 |
| туалет-1этаж.json | F1-BATH | REVIEW REQUIRED | 0.064 |
| туалет-2этаж.json | F2-SHOWER | REVIEW REQUIRED | 0.005 |

## Расхождения

Грани комнаты измерены по внутренней поверхности. Их длина не равна длине оси стены, проходящей через несколько комнат. Неизвестная толщина в сканах всегда null.

| Комната / объект | Параметр | Модель, м | Замер, м | Δ, м | Независимых подтверждений | Решение |
|---|---|---:|---:|---:|---:|---|
| F1-BOILER / F1-W08 | room-face-span:2 | 3.505 | 3.515 | 0.01 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-W03 | room-face-span:1 | 2.725 | 2.723 | -0.002 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-W12 | room-face-span:4 | 1.865 | 1.88 | 0.015 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-W09 | room-face-span:0 | 1.64 | 1.635 | -0.005 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-W11 | room-face-span:5 | 1.665 | 1.635 | -0.03 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-W10 | room-face-span:3 | 1.06 | 1.088 | 0.028 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-WIN05 | width | 0.76 | 0.762 | 0.002 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-WIN05 | height | 1.4 | 1.223 | -0.177 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-WIN05 | sill | 0.935 | 0.936 | 0.001 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-WIN05 | start | 4.76 | 4.761 | 0.001 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-EXT02 | width | 0.98 | 0.981 | 0.001 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-EXT02 | height | 2.14 | 2.139 | -0.001 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-EXT02 | sill | 0 | 0 | 0 | 0 | REVIEW REQUIRED |
| F1-BOILER / F1-EXT02 | start | 1.59 | 1.589 | -0.001 | 0 | REVIEW REQUIRED |
| F2-BATH / F2-W03 | room-face-span:1 | 2.81 | 2.814 | 0.004 | 1 | IGNORE |
| F2-BATH / F2-W13 | room-face-span:3 | 2.81 | 2.814 | 0.004 | 1 | IGNORE |
| F2-BATH / F2-W06 | room-face-span:2 | 1.905 | 1.891 | -0.014 | 1 | REVIEW REQUIRED |
| F2-BATH / F2-W07 | room-face-span:0 | 1.905 | 1.891 | -0.014 | 1 | REVIEW REQUIRED |
| F2-BATH / F2-WIN07 | width | 0.875 | 0.873 | -0.002 | 1 | IGNORE |
| F2-BATH / F2-WIN07 | height | 1.67 | 1.672 | 0.002 | 1 | IGNORE |
| F2-BATH / F2-WIN07 | sill | 0.84 | 0.84 | 0 | 1 | IGNORE |
| F2-BATH / F2-WIN07 | start | 1.79 | 1.793 | 0.003 | 1 | IGNORE |
| F1-GARAGE / GARAGE-W03 | room-face-span:6 | 7.131 | 7.131 | 0 | 1 | IGNORE |
| F1-GARAGE / GARAGE-W01 | room-face-span:0 | 6.376 | 6.376 | 0 | 1 | IGNORE |
| F1-GARAGE / F1-W08 | room-face-span:1 | 3.085 | 3.085 | 0 | 1 | IGNORE |
| F1-GARAGE / GARAGE-W02 | room-face-span:5 | 2.848 | 2.848 | 0 | 1 | IGNORE |
| F1-GARAGE / GARAGE-W05 | room-face-span:4 | 1.255 | 1.255 | 0 | 1 | IGNORE |
| F1-GARAGE / GARAGE-W05 | room-face-span:2 | 0.533 | 0.533 | 0 | 1 | IGNORE |
| F1-GARAGE / F1-GARAGE | room-face-span:3 | 0.428 | 0.428 | 0 | 1 | IGNORE |
| F1-GARAGE / F1-EXT02 | width | 0.98 | 1.019 | 0.039 | 0 | REVIEW REQUIRED |
| F1-GARAGE / F1-EXT02 | height | 2.14 | 2.069 | -0.071 | 0 | REVIEW REQUIRED |
| F1-GARAGE / F1-EXT02 | sill | 0 | 0.597 | 0.597 | 0 | REVIEW REQUIRED |
| F1-GARAGE / F1-EXT02 | start | 1.59 | 1.578 | -0.012 | 0 | REVIEW REQUIRED |
| F2-DRESS / F2-W08 | room-face-span:3 | 2.975 | 2.963 | -0.012 | 1 | REVIEW REQUIRED |
| F2-DRESS / F2-W10 | room-face-span:2 | 1.97 | 1.98 | 0.01 | 1 | REVIEW REQUIRED |
| F2-DRESS / F2-W01 | room-face-span:0 | 1.97 | 1.98 | 0.01 | 1 | REVIEW REQUIRED |
| F2-DRESS / F2-W09 | room-face-span:1 | 2.975 | 2.963 | -0.012 | 1 | REVIEW REQUIRED |
| F2-DRESS / F2-WIN02 | width | 0.945 | 0.945 | 0 | 1 | IGNORE |
| F2-DRESS / F2-WIN02 | height | 1.7 | 1.7 | 0 | 1 | IGNORE |
| F2-DRESS / F2-WIN02 | sill | 0.735 | 0.735 | 0 | 1 | IGNORE |
| F2-DRESS / F2-WIN02 | start | 4.465 | 4.464 | -0.001 | 1 | IGNORE |
| F2-CHILD / F2-W02 | room-face-span:5 | 4.165 | 4.164 | -0.001 | 1 | IGNORE |
| F2-CHILD / F2-W07 | room-face-span:4 | 3.485 | 3.501 | 0.016 | 1 | REVIEW REQUIRED |
| F2-CHILD / F2-W08 | room-face-span:1 | 3.075 | 3.093 | 0.018 | 1 | REVIEW REQUIRED |
| F2-CHILD / F2-W10 | room-face-span:2 | 0.255 | 0.264 | 0.009 | 1 | IGNORE |
| F2-CHILD / F2-W01 | room-face-span:0 | 3.23 | 3.237 | 0.007 | 1 | IGNORE |
| F2-CHILD / F2-W11 | room-face-span:3 | 1.09 | 1.071 | -0.019 | 1 | REVIEW REQUIRED |
| F2-CHILD / F2-WIN01 | width | 1.61 | 1.612 | 0.002 | 1 | IGNORE |
| F2-CHILD / F2-WIN01 | height | 2.345 | 2.346 | 0.001 | 1 | IGNORE |
| F2-CHILD / F2-WIN01 | sill | 0 | 0 | 0 | 1 | IGNORE |
| F2-CHILD / F2-WIN01 | start | 2.04 | 2.04 | 0 | 1 | IGNORE |
| F2-ROOM / F2-W04 | room-face-span:4 | 5.115 | 5.102 | -0.013 | 1 | REVIEW REQUIRED |
| F2-ROOM / F2-W02 | room-face-span:5 | 3.305 | 3.303 | -0.002 | 1 | IGNORE |
| F2-ROOM / F2-W05 | room-face-span:3 | 2.43 | 2.428 | -0.002 | 1 | IGNORE |
| F2-ROOM / F2-W15 | room-face-span:1 | 0.875 | 0.875 | 0 | 1 | IGNORE |
| F2-ROOM / F2-W06 | room-face-span:2 | 0.185 | 0.194 | 0.009 | 1 | IGNORE |
| F2-ROOM / F2-W14 | room-face-span:0 | 4.93 | 4.908 | -0.022 | 1 | REVIEW REQUIRED |
| F2-ROOM / F2-WIN06 | width | 1.765 | 1.765 | 0 | 1 | IGNORE |
| F2-ROOM / F2-WIN06 | height | 1.595 | 1.596 | 0.001 | 1 | IGNORE |
| F2-ROOM / F2-WIN06 | sill | 0.845 | 0.844 | -0.001 | 1 | IGNORE |
| F2-ROOM / F2-WIN06 | start | 2.955 | 2.964 | 0.009 | 1 | IGNORE |
| F2-ROOM / F2-WIN05 | width | 0.865 | 0.865 | 0 | 1 | IGNORE |
| F2-ROOM / F2-WIN05 | height | 2.44 | 2.44 | 0 | 1 | IGNORE |
| F2-ROOM / F2-WIN05 | sill | 0 | 0 | 0 | 1 | IGNORE |
| F2-ROOM / F2-WIN05 | start | 1.66 | 1.666 | 0.006 | 1 | IGNORE |
| F2-ROOM / F2-WIN04 | width | 1.06 | 1.074 | 0.014 | 1 | REVIEW REQUIRED |
| F2-ROOM / F2-WIN04 | height | 1.4 | 1.335 | -0.065 | 1 | REVIEW REQUIRED |
| F2-ROOM / F2-WIN04 | sill | 0.05 | 0.075 | 0.025 | 1 | REVIEW REQUIRED |
| F2-ROOM / F2-WIN04 | start | 5.09 | 5.287 | 0.197 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-W07 | room-face-span:4 | 3.585 | 3.579 | -0.006 | 1 | IGNORE |
| F2-HALL+F2-STAIR / F2-W02 | room-face-span:3 | 2.1 | 2.096 | -0.004 | 1 | IGNORE |
| F2-HALL+F2-STAIR / F2-W10 | room-face-span:0 | 1.345 | 1.362 | 0.017 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-W11 | room-face-span:5 | 1.495 | 1.475 | -0.02 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-W14 | room-face-span:2 | 4.93 | 4.941 | 0.011 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-W12 | room-face-span:1 | 3.595 | 3.571 | -0.024 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-WIN04 | width | 1.06 | 1.03 | -0.03 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-WIN04 | height | 1.4 | 1.448 | 0.048 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-WIN04 | sill | 0.05 | 0.524 | 0.474 | 1 | REVIEW REQUIRED |
| F2-HALL+F2-STAIR / F2-WIN04 | start | 5.09 | 5.122 | 0.032 | 1 | REVIEW REQUIRED |
| F1-OFFICE / F1-W15 | room-face-span:0 | 3.44 | 3.442 | 0.002 | 1 | IGNORE |
| F1-OFFICE / F1-W02 | room-face-span:5 | 3.095 | 3.095 | 0 | 1 | IGNORE |
| F1-OFFICE / F1-W04 | room-face-span:4 | 3.075 | 3.073 | -0.002 | 1 | IGNORE |
| F1-OFFICE / F1-W17 | room-face-span:3 | 2.035 | 2.036 | 0.001 | 1 | IGNORE |
| F1-OFFICE / F1-W16 | room-face-span:2 | 0.365 | 0.369 | 0.004 | 1 | IGNORE |
| F1-OFFICE / F1-W14 | room-face-span:1 | 1.06 | 1.059 | -0.001 | 1 | IGNORE |
| F1-OFFICE / F1-WIN06 | width | 1.785 | 1.784 | -0.001 | 1 | IGNORE |
| F1-OFFICE / F1-WIN06 | height | 1.775 | 1.776 | 0.001 | 1 | IGNORE |
| F1-OFFICE / F1-WIN06 | sill | 0.83 | 0.829 | -0.001 | 1 | IGNORE |
| F1-OFFICE / F1-WIN06 | start | 1.68 | 1.676 | -0.004 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-W03 | room-face-span:1 | 4.155 | 4.173 | 0.018 | 1 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-W09 | room-face-span:2 | 8.71 | 8.706 | -0.004 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-W02 | room-face-span:3 | 4.155 | 4.152 | -0.003 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-WIN04 | width | 2.235 | 2.236 | 0.001 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-WIN04 | height | 1.4 | 1.345 | -0.055 | 1 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN04 | sill | 0.895 | 0.895 | 0 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-WIN04 | start | 0.665 | 0.671 | 0.006 | 1 | IGNORE |
| F1-LIVING+F1-KITCHEN / F1-WIN02 | width | 2.44 | 2.47 | 0.03 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN02 | height | 2.615 | 2.615 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN02 | sill | 0 | 0 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN02 | start | 6.195 | 6.197 | 0.002 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN01 | width | 2.44 | 2.41 | -0.03 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN01 | height | 2.615 | 2.615 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN01 | sill | 0 | 0 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN01 | start | 1.24 | 1.24 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN03 | width | 0.95 | 0.949 | -0.001 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN03 | height | 2.39 | 2.39 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN03 | sill | 0 | 0 | 0 | 0 | REVIEW REQUIRED |
| F1-LIVING+F1-KITCHEN / F1-WIN03 | start | 2.42 | 2.426 | 0.006 | 0 | REVIEW REQUIRED |
| F2-BED / F2-W03 | room-face-span:1 | 4.165 | 4.127 | -0.038 | 1 | REVIEW REQUIRED |
| F2-BED / F2-W10 | room-face-span:4 | 0.39 | 0.394 | 0.004 | 1 | IGNORE |
| F2-BED / F2-W12 | room-face-span:3 | 1.09 | 1.087 | -0.003 | 1 | IGNORE |
| F2-BED / F2-W07 | room-face-span:2 | 3.68 | 3.695 | 0.015 | 1 | REVIEW REQUIRED |
| F2-BED / F2-W09 | room-face-span:5 | 3.075 | 3.04 | -0.035 | 1 | REVIEW REQUIRED |
| F2-BED / F2-WIN03 | width | 1.67 | 1.67 | 0 | 0 | REVIEW REQUIRED |
| F2-BED / F2-WIN03 | height | 2.39 | 2.39 | 0 | 0 | REVIEW REQUIRED |
| F2-BED / F2-WIN03 | sill | 0 | 0 | 0 | 0 | REVIEW REQUIRED |
| F2-BED / F2-WIN03 | start | 6.22 | 6.217 | -0.003 | 0 | REVIEW REQUIRED |
| F1-BATH / F1-W12 | room-face-span:2 | 1.765 | 1.749 | -0.016 | 0 | REVIEW REQUIRED |
| F1-BATH / F1-W09 | room-face-span:0 | 1.765 | 1.749 | -0.016 | 0 | REVIEW REQUIRED |
| F1-BATH / F1-W10 | room-face-span:3 | 1.565 | 1.597 | 0.032 | 0 | REVIEW REQUIRED |
| F1-BATH / F1-W11 | room-face-span:1 | 1.565 | 1.597 | 0.032 | 0 | REVIEW REQUIRED |
| F2-SHOWER / F2-W13 | room-face-span:1 | 2.81 | 2.806 | -0.004 | 0 | REVIEW REQUIRED |
| F2-SHOWER / F2-W07 | room-face-span:0 | 1.675 | 1.663 | -0.012 | 0 | REVIEW REQUIRED |
| F2-SHOWER / F2-SHOWER | room-face-span:2 | 1.675 | 1.663 | -0.012 | 0 | REVIEW REQUIRED |
|  / parameters.groundHeight | height | 3.03 | 3.025 | -0.005 | 2 | IGNORE |
|  / parameters.upperHeight | height | 3.045 | 3.038 | -0.007 | 5 | IGNORE |

## Ограничения и следующий обмер

- Высоты сканов согласованы для принятых комнат: первый этаж 3,03 м, высокая часть второго 3,045 м, гараж 2,927 м. Толщина перекрытия 0,22 м и отметка пола гаража −0,35 м остаются допущениями; высота ворот 2,70 м сохранена, потому что отдельная поверхность ворот в скане отсутствует.
- Контур гаража, выступ и ширина ворот приняты по скану в owner review (см. manual/garage-review.json). Грань GARAGE-W05 выровнена по F1-W08; актуальное совместное перемещение гаража и дома записано в manual/scan-fit.json.
- Стыки F1-W14/F1-W16/F1-W17 и F2-W12/F2-W14/F2-W15/F2-W16 сведены в непрерывные участки; решение записано в manual/wall-continuity-review.json.
- Для неоднозначных прямоугольных помещений нужны привязки дверей: одинаковый контур допускает несколько ориентаций.
- Не восстанавливаются новые окна/двери по одной классификации RoomPlan; рама и чистый проём могут иметь разные размеры.
- referenceOriginTransform применяется одинаково к полу и поверхностям, затем строится локальная система X/Z с Y вверх. Он не задаёт общую привязку разных сканов.
- Скосы и наружный контур уточнены по совместному подбору (WHOLE-HOUSE.md); число лестничных подъёмов сохранено. Толщина поперечных стен распространена вдоль существующих единых осей как допущение.

Подробные наблюдения, UUID, альтернативы регистрации, выбросы и причины решений — в [audit.json](audit.json); наглядное наложение — [overlay.html](overlay.html). Исходные JSON сохранены без изменений; мебель не используется.

Документация формата: [Apple — polygonCorners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners), [Apple — Surface](https://developer.apple.com/documentation/roomplan/capturedroom/surface), [Apple — Confidence](https://developer.apple.com/documentation/roomplan/capturedroom/confidence).
