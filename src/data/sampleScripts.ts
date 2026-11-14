import panelCoffeeShop from '../assets/images/sample_panel_coffee_shop_1794665391881.jpg';
import panelRainAlley from '../assets/images/sample_panel_rain_alley_1794665389920.jpg';
import panelRooftop from '../assets/images/sample_panel_rooftop_confrontation_1794665392785.jpg';
import panelTrainStation from '../assets/images/sample_panel_train_departure_1794665392404.jpg';
import type { SampleScriptTemplate } from '../types/storyboard';

export const SAMPLE_SCRIPTS: SampleScriptTemplate[] = [
  {
    id: 'morning-rain',
    title: 'Morning Rain',
    genre: 'Neo-Noir Drama',
    artStyle: 'Graphic Novel',
    aspectRatio: '16:9',
    scriptText: `INT. COFFEE SHOP - DAY

Morning rain streaks down the tall glass storefront. MAYA (20s, short black bob haircut, olive trench coat) sits at a wooden window counter, typing urgently on a silver laptop. Steam rises from a paper coffee cup beside her notebook.

EXT. COBBLESTONE ALLEY - DAY

Maya steps out from the warm glow of the cafe into the slick cobblestone alley. She unfolds a damp handwritten note, reading it beneath the drizzle as neon signage reflects in puddles at her feet.

EXT. CITY ROOFTOP - DAY

High above the misty skyline, Maya confronts MARCUS (40s, tall, charcoal wool overcoat). Marcus holds out an antique brass pocket watch between them as heavy overcast clouds drift past the skyscrapers.

EXT. GRAND RAILWAY STATION - DAY

Beneath a soaring glass-and-iron vaulted roof, Maya stands alone on Platform 8. Golden morning light cuts through the mist as a silver commuter train pulls away down the tracks.`,
    preloadedPanels: [
      {
        panel_number: 1,
        scene_heading: 'INT. COFFEE SHOP - DAY',
        action_summary:
          'Maya sits at a wooden window counter typing urgently on her laptop while morning rain streaks the glass outside.',
        characters_in_scene: [
          'Maya: woman in her late 20s with a sharp black bob haircut wearing an olive trench coat over a dark knit sweater',
        ],
        image_prompt:
          'Cinematic wide shot, young woman with short black bob hair in an olive trench coat typing on a silver laptop, busy modern coffee shop wooden window counter, morning sunlight streaming through rain-streaked glass windows with volumetric dust motes, graphic novel concept art style',
        imageUrl: panelCoffeeShop,
        renderStatus: 'ready',
      },
      {
        panel_number: 2,
        scene_heading: 'EXT. COBBLESTONE ALLEY - DAY',
        action_summary:
          'Stepping outside into the drizzle, Maya inspects a folded handwritten note illuminated by the warm cafe window.',
        characters_in_scene: [
          'Maya: woman in her late 20s with a sharp black bob haircut wearing an olive trench coat and holding a folded paper note',
        ],
        image_prompt:
          'Low angle medium shot, young woman with short black bob hair in an olive trench coat reading a folded paper note, slick wet cobblestone city alley outside a cafe in morning rain, warm cafe window light reflecting in puddles, moody atmospheric mist, graphic novel concept art style',
        imageUrl: panelRainAlley,
        renderStatus: 'ready',
      },
      {
        panel_number: 3,
        scene_heading: 'EXT. CITY ROOFTOP - DAY',
        action_summary:
          'On a fog-swept rooftop overlooking skyscrapers, Maya faces Marcus as he reveals a brass pocket watch.',
        characters_in_scene: [
          'Maya: woman in her late 20s with a sharp black bob haircut in an olive trench coat',
          'Marcus: tall man in his 40s with weathered features wearing a charcoal wool overcoat and holding a brass pocket watch',
        ],
        image_prompt:
          'Over-the-shoulder two-shot, young woman with short black bob hair in an olive trench coat facing a tall man in a charcoal wool overcoat holding a brass pocket watch, misty urban rooftop overlooking skyscrapers, dramatic overcast rim lighting and drifting fog, graphic novel concept art style',
        imageUrl: panelRooftop,
        renderStatus: 'ready',
      },
      {
        panel_number: 4,
        scene_heading: 'EXT. GRAND RAILWAY STATION - DAY',
        action_summary:
          'Alone on Platform 8, Maya watches a silver commuter train disappear into the golden morning haze.',
        characters_in_scene: [
          'Maya: woman in her late 20s with a sharp black bob haircut in an olive trench coat carrying a shoulder bag',
        ],
        image_prompt:
          'Extreme wide shot, young woman with short black bob hair in an olive trench coat standing alone on Platform 8 watching a silver train depart, grand glass-vaulted railway station concourse, dramatic shafts of golden morning sunlight piercing iron rafters, graphic novel concept art style',
        imageUrl: panelTrainStation,
        renderStatus: 'ready',
      },
    ],
  },
  {
    id: 'airlock-seven',
    title: 'Airlock Seven',
    genre: 'Sci-Fi Thriller',
    artStyle: 'Digital Concept Art',
    aspectRatio: '2.39:1',
    scriptText: `INT. ORBITAL CORRIDOR - NIGHT

Red emergency strobes pulse down a narrow titanium corridor. COMMANDER VERA CHEN (30s, buzzed dark hair, scorched white EVA suit without helmet) sprints toward the sealed bulkhead door, clutching a cracked data core.

INT. OBSERVATION DECK - NIGHT

Vera bursts onto the circular deck. Through the massive reinforced viewport, a fractured blue gas giant fills half the sky as debris drifts silently past. DR. ARIS THORN (50s, silver beard, dark flight jumpsuit) stands frozen by the main console.

CLOSE ON - DATA CONSOLE

Vera slams the glowing amber data core into the console slot. Sparks jump across the frosted glass screen as orbital trajectory lines lock into place.

EXT. OUTER HULL - SPACE

An extreme wide shot of the sleek research vessel firing its side thrusters, banking hard away from the planet's shimmering ring debris into deep starlight.`,
  },
  {
    id: 'midnight-booth',
    title: 'The Midnight Booth',
    genre: 'Mystery',
    artStyle: 'Noir Ink Wash',
    aspectRatio: '4:3',
    scriptText: `EXT. ROADSIDE DINER - NIGHT

A lone neon diner glows emerald and crimson beside an empty desert highway. Thick fog curls around a parked vintage black sedan with its headlights still burning.

INT. DINER BOOTH - NIGHT

DETECTIVE COLE (40s, rumpled tan raincoat, fedora tilted back) slides into a red vinyl booth opposite ELENA (30s, crimson silk scarf, dark wool coat). Between them sits a single brass key on a chipped saucer.

CLOSE ON - DINER WINDOW

Rainwater blurs the reflection of the neon sign. Outside in the mist, a shadowy figure in a long coat pauses beside the black sedan, watching the booth.`,
  },
];
