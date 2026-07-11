const names = {
    human: {
        male: ["Alden", "Bertram", "Cedric", "Doran", "Edmund", "Felix", "Gareth", "Harold", "Ivan", "Julian", "Kaelen", "Leopold", "Merrick", "Nathaniel", "Osmond", "Percival", "Quentin", "Roderick", "Silas", "Tobias"],
        female: ["Adela", "Beatrix", "Clara", "Dorothy", "Edith", "Felicia", "Gwen", "Hilda", "Isolde", "Juliana", "Katarina", "Lucia", "Millicent", "Norah", "Odette", "Philippa", "Rowena", "Sibyl", "Theodora", "Ursula"]
    },
    elf: {
        male: ["Aelien", "Belenos", "Caelum", "Draugr", "Eldrin", "Faolan", "Galanth", "Halar", "Ithil", "Jaelen", "Kaelan", "Luthian", "Mithrandir", "Nathra", "Orelen", "Paelen", "Quirin", "Raelian", "Saelen", "Thaelen"],
        female: ["Aeliana", "Belen", "Caelya", "Draugra", "Eldrina", "Faolana", "Galantha", "Halara", "Ithila", "Jaelena", "Kaelana", "Luthiana", "Mithra", "Nathrae", "Orelia", "Paelia", "Quirina", "Raelia", "Saelia", "Thaelia"]
    },
    dwarf: {
        male: ["Barek", "Dain", "Eitri", "Fili", "Gloin", "Halin", "Kili", "Loni", "Morni", "Nain", "Oin", "Pili", "Ruri", "Suri", "Thorin", "Uri", "Vari", "Zari", "Bifur", "Bofur"],
        female: ["Barka", "Daina", "Eitra", "Filia", "Gloina", "Halina", "Kilia", "Lonia", "Mornia", "Naina", "Oina", "Pilia", "Ruria", "Suria", "Thora", "Uria", "Varia", "Zaria", "Bifura", "Bofura"]
    },
    goblin: {
        male: ["Grukk", "Nizzik", "Vrag", "Snagrat", "Uzzik", "Krull", "Mugg", "Ratlik", "Fenzik", "Yorrik", "Dregnak", "Skitter", "Bogrik", "Wretch", "Cragnub", "Zorrik", "Malrik", "Pikk", "Snarl", "Grimtooth"],
        female: ["Nizza", "Skreea", "Vragga", "Snagra", "Uzza", "Krulla", "Mugga", "Ratlia", "Fenza", "Yorra", "Dregna", "Skitta", "Bogra", "Wretcha", "Cragna", "Zorra", "Malra", "Pikka", "Snarla", "Grimtootha"]
    },
    orc: {
        male: ["Grukan", "Tharok", "Vulgar", "Morgash", "Uthak", "Krezz", "Bralak", "Gornax", "Drakor", "Skarnok", "Ironhide", "Vraskul", "Mogrim", "Hurgash", "Zoggrim", "Bratak", "Krund", "Warguk", "Thromm", "Grimjaw"],
        female: ["Grukana", "Tharoka", "Vulgara", "Morgasha", "Uthaka", "Krezza", "Bralaka", "Gornaxa", "Drakora", "Skarnoka", "Vraskula", "Mogrima", "Hurgasha", "Zoggrima", "Brataka", "Krunda", "Warguka", "Thromma", "Grimjawa", "Ashka"]
    }
};

window.getRandomName = function(race, gender) {
    const list = names[race][gender];
    return list[Math.floor(Math.random() * list.length)];
};

window.generateName = window.getRandomName;
