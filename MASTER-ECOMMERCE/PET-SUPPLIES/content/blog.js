'use strict';
// Pet-care guides: generic, practical, non-medical. Not veterinary advice. Replace/extend with editorial content from your team.
const A = (slug, title, description, date, category, blocks) => ({ slug, title, description, date, category, blocks });
const h = (t) => ({ h: t }); const p = (t) => ({ p: t }); const ul = (...i) => ({ ul: i });
module.exports = [
  A('how-to-choose-a-dog-collar-or-harness', 'How to choose a dog collar or harness', 'A practical guide to measuring your dog, choosing between a collar and a harness, and checking the fit.', '2026-10-02', 'Walking & gear', [
    p('A collar and a harness do different jobs. A collar carries ID and is handy for everyday wear; a harness spreads pressure across the chest and is often chosen for walks. Many dogs use both.'),
    h('Measure first'), p('Use a soft tape (or a piece of string and a ruler). For a collar, measure around the middle of the neck. For a harness, measure the widest part of the chest just behind the front legs. Compare with the ranges in centimetres on each product page rather than guessing from breed.'),
    h('The two-finger rule'), p('Once fitted, you should be able to slide two fingers between the strap and your dog. Any looser and it may slip off; any tighter and it can chafe.'),
    h('Think about how your dog walks'), ul('Dogs that pull: a front-clip harness can make pulling less rewarding.', 'Small and flat-faced breeds: a harness avoids pressure on the neck.', 'Everyday wear: padded nylon is light and washes easily.'),
    p('Puppies grow fast, so re-check the fit every week or two. Always supervise a dog wearing a new accessory.')]),
  A('how-to-read-a-pet-food-label', 'How to read a pet food label', 'What to look for on a dog or cat food pack: life stage, ingredients, guaranteed analysis and feeding guide.', '2026-10-09', 'Food & feeding', [
    p('Pet food packs carry a lot of information. These are the parts worth reading before you buy.'),
    h('Life stage and size'), p('Check the pack says which life stage it is made for (puppy or kitten, adult, senior) and, for dogs, whether it targets small or large breeds.'),
    h('Ingredients'), p('Ingredients are usually listed in order of weight. Look for the main protein source named clearly. If your pet has a known food intolerance, discuss the diet with your veterinarian.'),
    h('Nutritional information'), p('The guaranteed analysis shows minimum protein and fat and maximum fibre and moisture. Wet and dry foods are not directly comparable because of their water content.'),
    h('Feeding guide and dates'), p('Use the feeding guide as a starting point and adjust to your pet\'s body condition. Always check the batch number and expiry date and store the food as directed.')]),
  A('switching-your-dogs-food-gradually', 'Switching your dog\'s food gradually', 'A simple 7 to 10 day transition plan for moving a dog to a new food.', '2026-10-16', 'Food & feeding', [
    p('Sudden diet changes can upset a dog\'s stomach. A gradual switch gives their digestion time to adjust.'),
    h('A simple schedule'), ul('Days 1-2: about 25% new food mixed with 75% old food.', 'Days 3-4: roughly half and half.', 'Days 5-6: about 75% new and 25% old.', 'Day 7 onward: 100% new food.'),
    p('Some dogs need a slower change, up to ten days or more. Keep meal times and portions consistent while you transition.'),
    h('When to ask your vet'), p('If your dog has persistent vomiting or diarrhoea, loses appetite, or has a medical condition, contact your veterinarian rather than continuing the change. This guide is general information, not veterinary advice.')]),
  A('setting-up-your-home-for-a-new-kitten', 'Setting up your home for a new kitten', 'A checklist for the first week: a safe room, litter, scratchers, food and play.', '2026-10-23', 'Cats', [
    p('Kittens are curious and quick. A little preparation makes the first week calmer for everyone.'),
    h('Start with one room'), p('Give your kitten a quiet room with a bed, water, food, litter and a place to hide. Open up the rest of the home gradually.'),
    h('The essentials'), ul('Litter box and litter: keep it away from food and water, and scoop daily.', 'Scratcher: a stable sisal post or cardboard lounge near where the kitten sleeps.', 'Food: a kitten-formulated recipe, introduced exactly as the breeder or shelter was feeding.', 'Toys: a wand toy for supervised play and a few soft toys for solo play.'),
    h('Safety'), p('Check for loose cords, small objects, toxic houseplants and open windows. Ask your veterinarian about vaccination and parasite-prevention schedules.')]),
  A('clumping-vs-plant-based-cat-litter', 'Clumping vs plant-based cat litter', 'How the two main litter types differ and how to switch without upsetting your cat.', '2026-10-30', 'Cats', [
    p('Litter is a personal choice, and cats have opinions. Here is how the main types compare.'),
    h('Clumping clay'), p('Forms firm clumps that are easy to scoop. It is heavier to carry and can be dusty depending on the product.'),
    h('Plant-based'), p('Made from plant fibre or similar materials. Usually lighter and softer, and some types can be disposed of differently; check the pack for guidance.'),
    h('Switching'), p('Mix the new litter with the old over a week or so. If your cat starts avoiding the box, go back a step and talk to your veterinarian if it continues.'),
    h('Box placement'), p('Put litter boxes in a quiet, easy-to-reach spot, away from food and water. A common guideline is one box per cat plus one extra.')]),
  A('walking-your-dog-in-indian-summers', 'Walking your dog in Indian summers', 'Simple, general tips for keeping walks comfortable in hot weather.', '2026-11-03', 'Walking & gear', [
    p('Heat can be hard on dogs, especially flat-faced breeds, thick-coated dogs, puppies and seniors. These are general comfort tips, not medical advice.'),
    h('Choose your time'), p('Walk early in the morning or after sunset when the ground has cooled.'),
    h('The hand test'), p('Press the back of your hand on the pavement for five seconds. If it is too hot for you, it is too hot for paw pads.'),
    h('Water and rest'), p('Carry water and a collapsible bowl, offer drinks often, and rest in shade. Never leave a dog in a parked vehicle.'),
    h('Know the signs'), p('Heavy panting that does not ease, drooling, weakness or collapse need urgent veterinary attention. Contact a veterinarian immediately if you are worried.')]),
  A('bowls-slow-feeders-and-automatic-feeders', 'Bowls, slow feeders and automatic feeders: which do you need?', 'A quick guide to feeding equipment and what each is good for.', '2026-11-05', 'Food & feeding', [
    p('Most pets are perfectly happy with a simple bowl. The other options solve specific problems.'),
    h('Standard bowls'), p('Stainless steel is durable and easy to clean. An anti-skid base stops bowls sliding around.'),
    h('Slow feeders'), p('Raised patterns make it harder to gulp food, which slows eating for pets that finish very quickly.'),
    h('Automatic feeders'), p('A timer-based feeder dispenses preset portions on schedule. It is useful for irregular working hours, but it does not replace daily check-ins. Prefer battery backup if you have frequent power cuts.'),
    h('Water'), p('Fresh water should always be available. Fountains encourage some cats to drink more, but need regular cleaning.')]),
  A('home-grooming-basics', 'Home grooming basics for dogs and cats', 'Brushing, nail trims and bathing: how often and what you need.', '2026-11-08', 'Grooming', [
    p('A little regular grooming keeps coats comfortable and lets you spot lumps, skin changes or parasites early.'),
    h('Brushing'), ul('Short coats: a weekly brush with a soft brush or grooming glove.', 'Long or double coats: more frequent brushing with a slicker brush and a comb to check for tangles.'),
    h('Nails'), p('Trim a little at a time and avoid the quick (the pink part inside the nail). If you are nervous, ask a groomer or veterinarian to demonstrate.'),
    h('Baths'), p('Use a shampoo made for pets, rinse thoroughly, and dry well. How often depends on coat, activity and your veterinarian\'s advice.'),
    p('If you notice persistent scratching, hair loss, sores or an unusual smell, see your veterinarian.')]),
];
