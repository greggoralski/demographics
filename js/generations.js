/* Generations by birth year. Each country's data names the set it uses:
   - statcan: Statistics Canada's 2021 Census names
   - pew:     Pew Research Center's names (United States)
   - common:  the same names, as commonly borrowed elsewhere (European Union)
   - decade:  decade of birth, the usual convention in China ("post-80s")
   The newest group is left open-ended. Colours come from css/style.css. */
(function () {
  function g(name, short, from, to, token) {
    var range = from === -Infinity ? 'born in ' + to + ' or earlier'
      : to === Infinity ? 'born from ' + from + ' on' : 'born from ' + from + ' to ' + to;
    return { name: name, short: short, from: from, to: to, range: range, token: token };
  }
  var western = function (boomEnd) {
    return [
      g('Greatest Generation', 'Greatest', -Infinity, 1927, '--gen-1'),
      g(boomEnd === 1965 ? 'Interwar Generation' : 'Silent Generation', boomEnd === 1965 ? 'Interwar' : 'Silent', 1928, 1945, '--gen-2'),
      g('Baby boomer', 'Boomers', 1946, boomEnd, '--gen-3'),
      g('Generation X', 'Gen X', boomEnd + 1, 1980, '--gen-4'),
      g('Millennial', 'Millennials', 1981, 1996, '--gen-5'),
      g('Generation Z', 'Gen Z', 1997, 2012, '--gen-6'),
      g('Generation Alpha and after', 'Alpha +', 2013, Infinity, '--gen-7')
    ];
  };
  var sets = {
    statcan: { list: western(1965), note: 'Statistics Canada counts everyone {range} in this group.' },
    pew: { list: western(1964), note: 'The Pew Research Center counts everyone {range} in this group.' },
    common: { list: western(1964), note: 'By the commonly used American definitions, this is everyone {range}. The European Union has no official ones.' },
    decade: {
      list: [
        g('Born before 1950', 'Pre-50s', -Infinity, 1949, '--gen-1'),
        g('Post-50s', 'Post-50s', 1950, 1959, '--gen-2'),
        g('Post-60s', 'Post-60s', 1960, 1969, '--gen-3'),
        g('Post-70s', 'Post-70s', 1970, 1979, '--gen-4'),
        g('Post-80s', 'Post-80s', 1980, 1989, '--gen-5'),
        g('Post-90s', 'Post-90s', 1990, 1999, '--gen-6'),
        g('Post-00s', 'Post-00s', 2000, 2009, '--gen-7'),
        g('Post-10s', 'Post-10s', 2010, 2019, '--gen-8'),
        g('Post-20s and after', 'Post-20s +', 2020, Infinity, '--gen-9')
      ],
      note: 'In China, generations are usually named by decade of birth: this is everyone {range}.'
    }
  };
  var G = window.GENERATIONS = {
    list: sets.statcan.list,
    note: sets.statcan.note,
    use: function (key) { var s = sets[key] || sets.statcan; G.list = s.list; G.note = s.note; },
    of: function (birth) {
      for (var i = 0; i < G.list.length; i++) if (birth >= G.list[i].from && birth <= G.list[i].to) return G.list[i];
      return null;
    }
  };
})();
