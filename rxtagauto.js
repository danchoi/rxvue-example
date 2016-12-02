function rxTagAuto() {
    var searchInput = new Rx.BehaviorSubject('')
    var keyCodes = new Rx.Subject() 
    var throttledInput = searchInput.distinctUntilChanged()
    var currentTags = Rx.Observable.just(tags)
    var mouseTagSelection = new Rx.Subject()

    var suggestedTickers = throttledInput
          .debounce(500) 
          .flatMap(function(query) { return $.get("/ticker_search?prefix="+query) })
          .map(function(res) {
            return $.map(JSON.parse(res), function(x) { return {value: x[0], label: x[1]} }) 
          })
          .distinctUntilChanged()
          .startWith([])

    var rxVue = new Vue(
          { el: '#rx-vue', 
            data: { query: '', sections: [], selected: [] },
            methods: {
                onChange: function(e) {
                    var up = this.query.toUpperCase()
                    this.query = up
                    searchInput.onNext(up)
                    keyCodes.onNext(e.keyCode)
                    // if (e.keyCode == 9) // prevent tabbing out e.preventDefault()
                },
                removeTag: function(t) {
                    this.selected = _.filter(this.selected, function(x) { return x !== t })
                },
                mouseOverTag: function(t) { t.selected = true; },
                mouseOutTag: function(t) { t.selected = false; },
                clickTag: function(t) { mouseTagSelection.onNext( t.value ) },
                deleteTag: function() { 
                  if (this.query == '') { this.selected.pop() }
                }
            }
          }
        )

    var viewModel = Rx.Observable
          .combineLatest(throttledInput, currentTags, suggestedTickers,
            function(inp, tags, sugs) {
              var ftags = _.map( tags, function(tag) { return {label: tag, value: tag} }),
                  newTag = _.contains(tags, inp) ? [] : [ {label: inp, value: inp} ],
                  filterTags = function(tag) { 
                                  return ( tag.value.toUpperCase().indexOf(inp) !== -1  ) 
                                      && ( ! _.contains(rxVue.selected, tag.value) )
                               },
                  sects = _.map(
                              _.zip(["Current Tags", "New Tag", "Suggestions"], 
                                    [_.filter(ftags, filterTags), newTag, _.filter(sugs, filterTags)]
                                    ),
                              function(x) { return {header: x[0], tags: x[1]} }
                            ),
                  sectsNonEmpty = _.filter(sects, function(x) { 
                                    return (inp !== '' && x.tags.length > 0)
                                  })
              return {input: inp, sections: sectsNonEmpty} 
            }
          )

    var navigationKeys = keyCodes
          .filter(function(x) { return _.contains([38,40,37.39], x) })
          .startWith(0)

    var selectionKey = keyCodes
          .filter(function(x) { return _.contains([9,13,188], x) })

    var viewUpdate = viewModel
          .map(function(viewModel) {
              return navigationKeys.map(
                  function(key) { 
                      var pos = _.isEmpty(viewModel.sections) ? null : [0,0]
                      return {model: viewModel, key:key, pos: pos } 
                  })
          })
          .switch()
          .scan(navigate)
          .shareReplay(1)

    viewUpdate.subscribe(function(x) {
      // console.log('viewModel: ' + JSON.stringify(x))
      rxVue.sections = x.model.sections
    })

    var keyboardTagSelection = selectionKey
          .withLatestFrom(viewUpdate, function(x, v) {
              var pos = v.pos,
                  item = pos ? v.model.sections[pos[0]].tags[pos[1]] : null;
              return item ? item.value : null
          })
          .filter(function(x) { return x }) // filter out null
          .map(function(x) { return x.replace(/,/g,"")  }) // strip trailing comma

    Rx.Observable.merge(keyboardTagSelection, mouseTagSelection)
          .subscribe(function(item) {
              rxVue.selected.push(item)
              rxVue.sections = [] 
              rxVue.query = ''
              rxVue.$refs.queryInput.focus()
              searchInput.onNext('') 
          })

    function navigate(acc, current) {
      var key = current.key,
          pos0 = acc.pos,
          curModel = current.model,
          matrix1 = modelToMatrix( curModel ),
          pos1 = newPos(pos0, key, matrix1)
      current.pos = pos1
      focusItem(current.model.sections, pos1)
      return current
    }
}
// returns a nav position matrix 
function modelToMatrix(s) {
  var xs = _.pluck(s.sections, 'tags')
  return toMatrix(xs)
}
function toMatrix(cols) {
  return _.map(cols, toColumn);
}
function toColumn(col, idx) {
   var ys = _.range(0, col.length)
       xs = _.times(col.length, function() { return idx });
   return _.zip(xs, ys)
}
function newPos(pos, key, matrix) {
  // 38 up 40 down; we don't handle sideways yet; neither does the Elm tagauto
  var flattened = _.flatten(matrix, true),
      curIdx = _.findIndex(flattened, function(x) { return arraysEqual(x, pos) }),
      newIdx = curIdx,
      newPos;
  if (curIdx == -1) {
    newIdx = 0;
  } else if (key == 38) {
    newIdx = curIdx > 1 ? curIdx - 1 : 0
  } else if (key == 40) {
    newIdx = (curIdx + 1) < _.size(flattened) ? curIdx + 1 : curIdx
  }
  newPos = flattened[newIdx]
  return newPos
}
function focusItem(sections, pos) {
  sections.forEach(function(s, i) {
    s.tags.forEach(function(tag, j) {
      tag.selected = (i == pos[0] && j == pos[1]) 
    })
  })
}
function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
