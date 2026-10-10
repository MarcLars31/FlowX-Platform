/** Name-based discovery groups. These are not verified technical properties.
 * Never use a project number, an article-number prefix or requirement prose to
 * classify an offered item. Unknown names stay unclassified. */
export const OFFER_PRODUCT_GROUPS = {
  pipe: 'Rör', bend: 'Rörböjar', tee: 'T-rör och avstick', reducer: 'Dimensionsövergångar',
  coupling: 'Rörkopplingar', cap: 'Ändlock och pluggar', flange: 'Flänsar', seal: 'Packningar och tätningar',
  support: 'Upphängning och konsoler', fastener: 'Skruv och infästning',
  ball_valve: 'Kulventiler', check_valve: 'Backventiler', butterfly_valve: 'Spjällventiler',
  control_valve: 'Regler- och injusteringsventiler', shutoff_valve: 'Avstängningsventiler',
  safety_valve: 'Säkerhets- och tryckreduceringsventiler', valve_accessory: 'Ventiltillbehör och ställdon',
  sprinkler_head: 'Sprinklerhuvuden', sprinkler_station: 'Sprinklercentraler', sprinkler_accessory: 'Sprinklertillbehör',
  fire_hose: 'Brandslang och slangposter', extinguisher: 'Brandsläckare',
  pump: 'Pumpar', pump_accessory: 'Pumptillbehör', filter: 'Filter och avskiljare',
  tank: 'Tankar och expansionskärl', water_heater: 'Varmvattenberedare', heat_exchanger: 'Värmeväxlare',
  radiator: 'Radiatorer och konvektorer', insulation: 'Rörisolering',
  toilet: 'Toaletter', basin: 'Tvättställ och diskbänkar', tap: 'Blandare och tappventiler',
  shower: 'Duschar', sanitary_accessory: 'Sanitetstillbehör', drain: 'Golvbrunnar och vattenlås',
  chamber: 'Brunnar och brunnsdelar', meter: 'Mätare och givare', meter_accessory: 'Mätartillbehör',
  cable: 'Kablar och ledare', conduit: 'Kabelrör', cable_tray: 'Kabelstegar och kabelrännor',
  trunking: 'Installationskanaler och uttagsstavar', electrical_box: 'El- och kopplingsdosor',
  socket: 'Vägguttag och industridon', switch: 'Brytare', grounding: 'Jordningsmaterial',
  lighting: 'Belysning', heating_cable: 'Värmekablar', electric_heater: 'Elradiatorer',
  electrical_accessory: 'Eltillbehör', data_network: 'Datauttag och nätverksmateriel', tools: 'Verktyg',
  hose: 'Slangar', expansion_joint: 'Kompensatorer', air_heating: 'Luftridåer och fläktkonvektorer',
  plumbing_distribution: 'Fördelare och fördelarskåp', control: 'Styrutrustning', signage: 'Skyltar och märkning',
  other: 'Övriga identifierade produkter', unknown: 'Produktgrupp behöver granskas'
} as const;
export type OfferProductGroup = keyof typeof OFFER_PRODUCT_GROUPS;
export function isOfferProductGroup(value: unknown): value is OfferProductGroup {
  return typeof value === 'string' && Object.hasOwn(OFFER_PRODUCT_GROUPS, value);
}
function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae');
}
export function classifyAhlsellOfferProduct(name: string): OfferProductGroup {
  const full = normalize(name).replace(/^\d+_/, '');
  // "Klammer for kabel" is a clamp, and a complete pipe with a socket is a pipe.
  const text = full.split(/\s+(?:(?:for|til|med|inkl|inkludert|inklusive)\b|[ftm]\/)/)[0];
  const has = (pattern: RegExp) => pattern.test(text);
  const basin = /\b(?:servant|vaskekar|utslagsvask|oppvaskkum|vaskerenne)\b/.exec(text);
  const basinAccessory = /\b(?:konsoll|bolt|feste|holder|vannlas|\w*vannlas)\b/.exec(text);
  if (basin && (!basinAccessory || basin.index < basinAccessory.index)) return 'basin';
  if (has(/\b(?:kompensator|gummikompens\w*)\b/)) return 'expansion_joint';
  if (has(/\b(?:luftport|takkassett|flaktkonvektor)\b/)) return 'air_heating';
  if (has(/\b(?:industrivannslange|trykkslange)\b/)) return 'hose';
  if (/armaflex|rockwool 800|pipelane|isovarm|skumsett|purposeskum|platerull/.test(text)) return 'insulation';
  if (has(/\b(?:branntrommel|slangetrommel|brannpost|brannskap|stralerorskap)\b/)) return 'fire_hose';
  if (/\b(?:sprinkler|s\.hode|sprinker|sprinklersla)/.test(full) && has(/\b(?:nokkel|lokk|dekkskive|feste)\b/)) return 'sprinkler_accessory';
  if (has(/\b(?:overg)\b/)) return 'reducer';
  if (/\d(?:bend)\b/.test(text)) return 'bend';
  if (has(/\b(?:sveisepropp|endeavslutning|endestykkesett)\b/)) return 'cap';
  if (has(/\b(?:krympestrompe|endetetning)\b/)) return 'seal';
  if (has(/\b(?:pemu fferor|pemufferor|mufferor)\b/)) return 'pipe';
  if (has(/\b(?:nor-kupl|tippunion|union)\b/)) return 'coupling';
  if (has(/\b(?:fotplate|vinkelkonsol|pumpesoyle|gummiklosser|monteringskonsoll|gjengestag|takfester)\b/)) return 'support';
  if (has(/\b(?:nivavippe|temperaturfoler|utetemperaturfoler|lavtrykksvakt)\b/)) return 'meter';
  if (has(/\b(?:foler lomme|trykknappventil)\b/)) return 'meter_accessory';
  if (has(/\b(?:vakumutskiller|mikrob\.\s*utsk\w*|avlufter|\w*utskiller|slamuts\w*)\b/)) return 'filter';
  if (has(/\b(?:aquapressokar|primaerkar)\b/)) return 'tank';
  if (has(/\b(?:hurtigbered|el-kjel)\b/)) return 'water_heater';
  if (has(/\b(?:glykol|propylenglykol|siliconfett|forstehjelpstasjon|rorsmansjett|rormansjett|rorstruper|takbeslag|takbesl)\b/)) return 'other';
  if (has(/\b(?:styresystem|vifteregulering|alarmlampe|alarmhorn|trykkvedlikeholdssystem)\b/)) return 'control';
  if (has(/\b(?:\w*verktoy|\w*verktøy|\w*tang|quicktool)\b/)) return 'tools';
  if (has(/\b(?:varselskilt|plogskilt|\w*skilt|skilt\w*)\b/)) return 'signage';
  if (has(/\b(?:datauttak|modularuttak|konnektor|patchpanel|patchesnor|datalokk|foringspanel|rj45|keystone|montasjesett data|gulvskap|veggskap)\b/)) return 'data_network';
  if (has(/\b(?:fordelerskap|fordelerror|gulvvarmefordeler|v\.fordeler|quickbox|vuk boks)\b/)) return 'plumbing_distribution';
  if (has(/\b(?:batterifeste|utlopstut|s-tut|veggroset\w*|rosett|dekkskive|\w*holder|armstotte|hardplastsete|sete|botterist|veggpanel|klosettstuss|hc-hendel|betjen\.plate)\b/)) return 'sanitary_accessory';
  if (has(/\b(?:boltesett|skruesett|servantplugg|fischerbolt|6kt\.skr)\b/)) return 'fastener';
  if (has(/\b(?:veggkonsoll\w*|veggfeste|spennband|festetrad)\b/)) return 'support';
  if (has(/\b(?:magnetstav|magnet)\b/)) return 'filter';
  if (has(/\b(?:vannlas|\w*vannlas|kombiv\.las|avlop|spalterist|gitterrist|gulvbronn|avlopsrenne|aco drain|vakuumventil|avlopslufter)\b/)) return 'drain';
  if (has(/\b(?:tilbakeslag\w*|tilbakesl\.ventil|tilbakseslag\w*|tilb\.slag\w*|tilb\.sl\.ventil|plateventil|tbs ventil)\b/)) return 'check_valve';
  if (has(/\b(?:dreiespj\.?|dreiespj\.vent\w*)\b/)) return 'butterfly_valve';
  if (has(/\b(?:kulevent\w*|ballofix|kulev\.)/)) return 'ball_valve';
  if (has(/\b(?:trykkred\w*|trykkred\.ventil|sikkerh\w*|red\.ventil)\b/)) return 'safety_valve';
  if (has(/\b(?:blandeventil|magnetventil|magnetven|soneregulerings\w*|innregulerings-ventil\w*)\b/)) return 'control_valve';
  if (has(/\b(?:slueseventil|vinkelventil)\b/)) return 'shutoff_valve';
  if (has(/\b(?:gir|spak|ratt|reguleringsmotor)\b/) && !has(/\b\w*ventil\w*\b/)) return 'valve_accessory';
  if (has(/\b(?:potensialutjevnings\w*|lynoppfanger|aluminiumsleder|falseklemme|kryssklemme|utgjevningsklemme)\b/)) return 'grounding';
  if (has(/\b(?:stromadapter|stromforsyning|trafo|usb.*lader|kapsling|charge max|kombiavleder|overspenningsavleder)\b/)) return 'electrical_accessory';
  if (has(/\b(?:nodstoppboks|mikrobryter)\b/)) return 'switch';
  if (has(/\b(?:nattlys|markeringslys|signallampe|floodlight|obstruction light)\b/)) return 'lighting';
  if (has(/\b(?:servantkran|vannutkaster|servantbatt|serv\.batt|kj\.batt|veggbatt\w*|kuletappekr|vaskemaskinkr|vaskem\.kran)\b/)) return 'tap';
  if (has(/\b(?:storkjokkendusj|oyedusj|nod\w*dusj)\b/)) return 'shower';
  if (has(/\b(?:veggskal|innbygningssisterne|sisterne|innb\.sisterne)\b/)) return 'toilet';
  if (has(/\b(?:utslagsv|intra u4)\b/)) return 'basin';
  if (has(/\b(?:servantror|multipex\s+r-i-r|pp ro\b)/)) return 'pipe';
  if (has(/\b(?:platealbue|platealbu|albu)\b/)) return 'bend';
  if (has(/\b(?:\w*kupling|\w*kobling|slangekupl|fordelerkupl|counter connection|flexseal)\b/)) return 'coupling';
  if (has(/\b(?:vannsensor\w*|sitrans)\b/)) return 'meter';
  if (has(/\b(?:linkbox|kontrollenhet|komfyrvakt|control panel)\b/)) return 'control';
  if (has(/\b(?:varmekabel|frostbeskyttelseskabel|defrost pipe|heating cable)\b/)) return 'heating_cable';
  if (has(/\b(?:elradiator|panelovn|varmeovn|elektrisk varmeovn)\b/)) return 'electric_heater';
  if (has(/\b(?:kabelstige|kabelbro|kabelbru|kabelrenne|gitterrenne|cable tray|cable ladder)\b/)) return 'cable_tray';
  if (has(/\b(?:installasjonskanal|installationskanal|grenstav|grenstaver|uttagsstav|servicepost)\b/)) return 'trunking';
  if (has(/\b(?:kabelror|k-ror|k-rr|rilleror|trekkeror|hf-coilfix)\b/)) return 'conduit';
  if (has(/\b(?:jordskinne|jordings\w*|potensialutlignings\w*)\b/)) return 'grounding';
  if (has(/\b(?:veggboks|veggbokser|multiboks|dobbelboks|bigbox|takboks\w*|koblingsboks|kobl\.box\w*|koblingsdosa)\b|\bboks\b.*\b(?:stender|lop|brann)\b/)) return 'electrical_box';
  if (has(/\b(?:stikk|stikkontakt\w*|dobbelt?stikk|kombistikk|schuko|shuko|vegguttak|vagguttag)\b/)) return 'socket';
  if (has(/\b(?:sikkerhetsbryter|nokkelbryter|bryter|switch)\b/)) return 'switch';
  if (has(/\b(?:armatur|downlight|lysarmatur|belysningsarmatur|led\s+(?:panel|stripe|lys)|luminaire)\b/)) return 'lighting';
  if (has(/\b(?:aktuator|actuator|ventilmotor|termostathode|handratt|spindelforlenger)\b/)) return 'valve_accessory';
  if (has(/\b(?:manometerkran|folerlomme|sensorlomme|thermowell)\b|\blomme\b.*\b(?:mask|term)/)) return 'meter_accessory';
  if (has(/\b(?:sprinklerkile|sprinklergitter|sprinklerskap|sprinklerslange|vicflex|dekk\w*|rosett)\b/)
    && /sprinkler|vicflex/.test(full)) return 'sprinkler_accessory';
  if (has(/\b(?:alarmventil|sprinklersentral|kontrollventilsett)\b/)) return 'sprinkler_station';
  if (has(/\b(?:sprinkler|sprinklerhode|sprinklerhoder|sprinklerdyse)\b/)) return 'sprinkler_head';
  if (has(/\b(?:brannslange|brannslang\w*|slangepost\w*)\b/)) return 'fire_hose';
  if (has(/\b(?:brannslukker|brannslokker|handslokker|handslukker|pulverapparat|skumapparat|extinguisher)\b/)) return 'extinguisher';
  if (has(/\b(?:armaflex|cellegummi|rorskal|universalrorskal|lamellmatte|pipelane|isolasjon|isolering)\b/)) return 'insulation';
  if (has(/\b(?:pakning|\w*pakning|tetningsring|o-ring|flenspakn|flensepakn|pakn\.|klingersil)\b/)) return 'seal';
  if (has(/\b(?:roroppheng|rorklammer|oppheng|klammer|konsoll|rorstotte|rorbarer|support|vibrasjonsdemp\w*|vibration damper|festeplate|stavfot)\b/)) return 'support';
  if (has(/\b(?:skrue|skruer|bolt|bolter|gjengestang|mutter|skive|stifter|ekspansjonsbolt)\b/)) return 'fastener';
  if (has(/\b(?:kuleventil|ball valve)\b/)) return 'ball_valve';
  if (has(/\b(?:tilbakeslagsventil|backventil|check valve)\b/)) return 'check_valve';
  if (has(/\b(?:spjeldventil|dreiespjeldventil|butterfly valve)\b/)) return 'butterfly_valve';
  if (has(/\b(?:reguleringsventil|reg\.ventil|reg\.v|innreguleringsventil|reglerventil|strupeventil|modulator|stad|staf|stap|ta-nano|compact-p|energy valve)\b/)) return 'control_valve';
  if (has(/\b(?:sikkerhetsventil|trykkreduksjonsventil|reduksjonsventil)\b/)) return 'safety_valve';
  if (has(/\b(?:stengeventil|sluseventil|gate valve|skyvespjeldventil|sprinklerventil)\b/)) return 'shutoff_valve';
  if (has(/\b(?:kabel|\w*kabel|ifsi|ifxi|bfsi|bfxi|pfxp|pfsp|tfxp|lihch|ifli|ix|pn|fxqj)\b/) && !has(/\b(?:skjotesett|verktoy|avmantlingsverktoy)\b/)) return 'cable';
  if (has(/\b(?:pumpe|\w*pumpe|pump|tpe3?|tped|magna3?|alpha2|cre|crie|seg)\b/)) return 'pump';
  if (has(/\b(?:lop\w*hjul|koblingsfot|inlet disk)\b/)) return 'pump_accessory';
  if (has(/\b(?:filter|\w*filter|sil|slamutskiller|mikrob\.?utskill\w*|luftutskiller|zeparo)\b/)) return 'filter';
  if (has(/\b(?:bereder|varmtvannsbereder)\b/)) return 'water_heater';
  if (has(/\b(?:varmeveksler|plateveksler|vvx|swep)\b/)) return 'heat_exchanger';
  if (has(/\b(?:tank|\w*tank|ekspansjonskar|expansionskarl|eksp\.kar|reflex|aquapresso|statico)\b/)) return 'tank';
  if (has(/\b(?:radiator|konvektor|varmluftsvifte)\b/)) return 'radiator';
  if (has(/\b(?:kl\.sete|klosettsete|toalettsete|betjen\w*plate|trykknapp|papirholder|handkle\w*|speil|servantkonsoll)\b/)) return 'sanitary_accessory';
  if (has(/\b(?:klosett|toalett|toilet|wc)\b/)) return 'toilet';
  if (has(/\b(?:blandebatteri|\w*batteri|blander|\w*blander|tappeventil|tappekran|utekran)\b/)) return 'tap';
  if (has(/\b(?:dusj|dusjsett|dusjstang|handdusj)\b/)) return 'shower';
  if (has(/\b(?:servant|utslagsvask|vaskekar|oppvaskkum|benkebeslag|vaskerenne)\b/)) return 'basin';
  if (has(/\b(?:sluk|\w*sluk|slukunderdel|vannlas|silkurv|avlopsrenne|gulvbrunn|kassarist)\b/)) return 'drain';
  if (has(/\b(?:kum|\w*kum|kumlokk|kumgjennomforing|teleskoppakning|stigeror|ulefos|balder lokk)\b/)) return 'chamber';
  if (has(/\b(?:manometer|termometer|maskintermometer|skivetermomtr|mask\.term\w*|vannmaler|stromningsmaler|flowmeter|energimaler|trykkvakt|trykkbryter|stromningsvakt|pressostat|sensor|level tr)\b/)) return 'meter';
  if (has(/\b(?:styreskap|sentralenhet|termostat|heatreg|waterguard|lekkasj\w*|relair)\b/)) return 'control';
  if (has(/\b(?:blindflens|endelokk|endebunn|plugg|ters|utluftingspropp)\b/)) return 'cap';
  if (has(/\b(?:reduksjon|reduksjons\w*|overgang|overgangs\w*|redusert|reducer)\b/)) return 'reducer';
  if (has(/\b(?:t-ror|t-stykke|t stykke|tee|grenror|avstikk|anboringsklammer)\b/)) return 'tee';
  if (has(/\b(?:bend|albue|rorboy|elbow)\b/)) return 'bend';
  if (has(/\b(?:flens|\w*flens|flensadapter|flenseadapter|sveisekrage)\b/)) return 'flange';
  // Fittings after 'for'/'med' do not change the main identity of a pipe.
  if (has(/\b(?:ror|stalror|trykkror|avlopsror|overvanns?ror|drensror|kobberror|kopparror|systemror|stakeror|avl\.ror|pemu fferor)\b/)) return 'pipe';
  if (has(/\b(?:kupling|kopling|kobling|rillekobling|skjotekobling|muffe|\w*muffe|nippel|\w*nippel|adapter|stottehylse|coupling)\b/)) return 'coupling';
  if (has(/\b(?:skilt|skiltpakke|merking|markering)\b/)) return 'signage';
  if (has(/\b(?:paveggskappe|kappe|ramme|skjotesett)\b/)) return 'electrical_accessory';
  if (has(/\b(?:hengelas|plasttonne|kjemi|lim|rensemiddel)\b/)) return 'other';
  return 'unknown';
}

/** Reject only two explicit, incompatible identities. Unknown names retain the
 * existing technical ranking. Related valve and fitting groups remain eligible. */
export function offerProductGroupsCompatible(wanted: OfferProductGroup, actual: OfferProductGroup) {
  if (wanted === 'unknown' || actual === 'unknown' || wanted === actual || wanted === 'other' || actual === 'other') return true;
  const related: OfferProductGroup[][] = [
    ['ball_valve','check_valve','butterfly_valve','control_valve','shutoff_valve','safety_valve'],
    ['bend','tee','reducer','coupling','cap','flange'],
    ['support','fastener'], ['conduit','electrical_box'], ['control','switch','meter']
  ];
  return related.some(group => group.includes(wanted) && group.includes(actual));
}
