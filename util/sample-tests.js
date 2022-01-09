function _test_from() {
  check(
    () => !from(0), // domain missing
    () => !from(0, 'unknown_domain'), // domain unknown
    () => from('0', 'string'),
    () => from(0, 'integer'),
    () => from(0, 'number'),
    () => from(true, 'boolean'),
    () => !from('true', 'boolean'),
    () => from(1, 1),
    () => !from(1, '1'), // !==
    () => from(1, [0, 1]),
    () => !from(2, [0, 1]),
    () => !from(false, [0, 1]), // sameValueZero
    () => from(NaN, [NaN, 1]), // sameValueZero
    () => !from(0, null), // empty domain = nothing
    () => from(0, {}), // no constraints = everything
    () => from(0, { via: () => {} }), // function domain == everything
    () => from(0, { via: set(() => {}, '_domain', 'integer') }),
    () => !from(0, { via: set(() => {}, '_domain', 'string') }),
    () => from('0', { via: set(() => {}, '_domain', 'string') }),
    () => !from(0, { via: [] }), // invalid via domain == nothing
    () => from(0, { is: 'integer' }),
    () => from(0, { in: [0, 1] }),
    () => from(NaN, { in: [NaN, 1] }), // sameValueZero
    () => !from(NaN, { in_eq: [NaN, 1] }), // ==
    () => !from(NaN, { in_eqq: [NaN, 1] }), // ===
    () => !from(false, { in: [0, 1] }), // sameValueZero
    () => from(false, { in_eq: [0, 1] }), // ==
    () => !from(false, { in_eqq: [0, 1] }), // ===
    () => !from({}, { in: [{}] }), // sameValueZero
    () => !from({}, { in_eq: [{}] }), // ==
    () => !from({}, { in_eqq: [{}] }), // ===
    () => from(0, { gte: 0 }) && from(1, { gte: 0 }) && !from(-1, { gte: 0 }),
    () => from(0, { lte: 0 }) && from(-1, { lte: 0 }) && !from(1, { lte: 0 }),
    () => !from(0, { gt: 0 }) && from(1, { gt: 0 }) && !from(-1, { gt: 0 }),
    () => !from(0, { lt: 0 }) && from(-1, { lt: 0 }) && !from(1, { lt: 0 }),
    () => !from(1, { gt: 0, lt: 1 }), // multiple constraints
    () => from(1, { gt: 0, lte: 1 }),
    () => from(0.5, { gt: 0, lte: 1 }),
    () => from(0.5, { gt: 0, lte: 1, eq: 0.5 }),
    () => !from(0.5, { gt: 0, lte: 1, eq: 0.6 }),
    () => from(1, { or: [{ eq: 0 }, { eq: 1 }] }),
    () => from(1, { or: [{ gt: 1 }, { eq: 1 }] }),
    () => from(1, { or: [{ gt: 1 }, { eq: 1, _test: 'ok' }] }),
    () => !from(1, { or: [{ gt: 1 }, { eq: 1, test: 'not ok' }] }),
    () => !from(1, { or: [{ gt: 1 }, { eq: 0 }] }),
    () => !from(1, { and: [{ eq: 0 }, { eq: 1 }] }),
    () => !from(1, { and: [{ gt: 1 }, { eq: 1 }] }),
    () => from(1, { and: [{ gte: 1 }, { eq: 1 }] }),
    () => from(1, { and: [{ gte: 1 }, { eq: 1, _test: 'ok' }] }),
    () => !from(1, { and: [{ gte: 1 }, { eq: 1, test: 'not ok' }] })
  )
}

function _test_distance() {
  check(
    () => [distance(0), undefined],
    () => [distance(0, null), undefined],
    () => [
      distance(
        0,
        set(() => {}, '_domain', [0])
      ),
      0,
    ], // also tests {via:func}
    () => [distance(0, 0), 0],
    () => [distance(0, [-1, 0, 1]), 0],
    () => [distance(0, [-1, -2]), 1],
    () => [distance(0, [-1, -2, null]), undefined],
    () => [distance(0, [-1, -2, '3']), undefined],
    () => [distance(0, [-1, -2, undefined]), undefined],
    () => [distance(0, [-1, -2, inf]), undefined], // infinities not allowed
    () => [distance(0, [-1, -2, NaN]), undefined],
    () => [distance(0, []), undefined],
    () => [distance(0, true), undefined], // non-object
    () => [distance(1, { _distance: x => abs(x - 5) }), 4], // custom _distance
    () => [distance(0, { is: 'number' }), undefined],
    () => [distance(0, { in: [1, 2] }), 1],
    () => [distance(0, { in_eq: [1, 2] }), 1],
    () => [distance(0, { in_eqq: [1, 2] }), 1],
    () => [distance(0, { in_equal: [1, 2] }), 1],
    () => [distance(0, { eq: 1 }), 1],
    () => [distance(0, { eqq: 1 }), 1],
    () => [distance(0, { equal: 1 }), 1],
    () => [distance(0, { gt: 1 }), 1],
    () => [distance(0, { gte: 1 }), 1],
    () => [distance(2, { gt: 1 }), 0],
    () => [distance(2, { gte: 1 }), 0],
    () => [distance(0, { lte: 1 }), 0],
    () => [distance(0, { lt: 1 }), 0],
    () => [distance(2, { lte: 1 }), 1],
    () => [distance(2, { lt: 1 }), 1],
    () => [distance(5, { gt: 1, lt: 3 }), 2],
    () => [distance(5, { and: [{ gt: 1 }, { lt: 3 }] }), 2],
    () => [distance(5, { or: [{ gt: 1 }, { lt: 3 }] }), 0],
    () => [distance(5, { or: [{ gt: 1 }, { lt: 3, _test: 'ok' }] }), 0],
    () => [distance(5, { or: [{ gt: 1 }, { lt: 3, test: 'no' }] }), undefined]
  )
}
