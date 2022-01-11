function _test_from() {
  check(
    () => !from(0), // domain undefined/omitted
    () => !from(0, 'unknown_type'), // unknown type
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
    () => throws(() => from(0, true)), // non-object
    () => !from(0, null), // empty domain = nothing
    () => from(0, {}), // no constraints = everything
    () => from(0, { via: () => {} }), // function domain == everything
    () => from(0, { via: set(() => {}, '_domain', 'integer') }),
    () => !from(0, { via: set(() => {}, '_domain', 'string') }),
    () => from('0', { via: set(() => {}, '_domain', 'string') }),
    () => throws(() => from(0, { via: [] })), // invalid via domain
    () => from(0, { is: 'integer' }),
    () => from(0, { eq: false }),
    () => !from(0, { eqq: false }),
    () => !from(0, { equal: false }),
    () => !from(NaN, { eq: NaN }),
    () => !from(NaN, { eqq: NaN }),
    () => from(NaN, { equal: NaN }),
    () => !from({}, { eq: {} }),
    () => !from({}, { eqq: {} }),
    () => from({}, { equal: {} }),
    () => from(0, { in: [0, 1] }),
    () => from(NaN, { in: [NaN, 1] }), // sameValueZero
    () => !from(NaN, { in_eq: [NaN, 1] }), // ==
    () => !from(NaN, { in_eqq: [NaN, 1] }), // ===
    () => from(NaN, { in_equal: [NaN, 1] }), // equal
    () => !from(false, { in: [0, 1] }), // sameValueZero
    () => from(false, { in_eq: [0, 1] }), // ==
    () => !from(false, { in_eqq: [0, 1] }), // ===
    () => !from(false, { in_equal: [0, 1] }), // equal
    () => !from({}, { in: [{}] }), // sameValueZero
    () => !from({}, { in_eq: [{}] }), // ==
    () => !from({}, { in_eqq: [{}] }), // ===
    () => from({}, { in_equal: [{}] }), // equal
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
    () => throws(() => from(1, { or: [{ gt: 1 }, { eq: 1, test: 'not ok' }] })),
    () => !from(1, { or: [{ gt: 1 }, { eq: 0 }] }),
    () => !from(1, { and: [{ eq: 0 }, { eq: 1 }] }),
    () => !from(1, { and: [{ gt: 1 }, { eq: 1 }] }),
    () => from(1, { and: [{ gte: 1 }, { eq: 1 }] }),
    () => from(1, { not: { and: [{ gt: 1 }, { eq: 1 }] } }),
    () => !from(1, { not: { and: [{ gte: 1 }, { eq: 1 }] } }),
    () => from(1, { and: [{ gte: 1 }, { eq: 1, _test: 'ok' }] }),
    () =>
      throws(() => from(1, { and: [{ gte: 1 }, { eq: 1, test: 'not ok' }] }))
  )
}

// test double-inversion on all domains used in _test_from (above)
// also test transformed inverse for domains that support it
function _test_invert() {
  const double_inverse_equal = domain => [invert(invert(domain)), domain]
  check(
    () => [invert(invert(undefined)), undefined], // domain undefined/omitted
    () => [invert(invert('string')), { is: 'string' }],
    () => [invert(invert(1)), { eqq: 1 }],
    () => [invert(invert([0, 1])), { in: [0, 1] }],
    () => throws(() => invert(true)), // non-object
    () => double_inverse_equal(null),
    () => [invert(null), {}],
    () => double_inverse_equal({}),
    () => [invert({}), null],
    () => [invert(invert({ via: () => {} })), {}],
    () => [invert({ via: () => {} }), null],
    () => [
      invert(invert({ via: set(() => {}, '_domain', 'string') })),
      { is: 'string' },
    ],
    () => throws(() => invert({ via: [] })), // invalid via domain
    () => double_inverse_equal({ is: 'integer' }),
    () => double_inverse_equal({ in_eq: 0 }),
    () => double_inverse_equal({ in_eqq: 0 }),
    () => double_inverse_equal({ in_equal: 0 }),
    () => double_inverse_equal({ in: [0, 1] }),
    () => double_inverse_equal({ in_eq: [0, 1] }),
    () => double_inverse_equal({ in_eqq: [0, 1] }),
    () => double_inverse_equal({ in_equal: [0, 1] }),
    () => double_inverse_equal({ gte: 0 }),
    () => double_inverse_equal({ lte: 0 }),
    () => double_inverse_equal({ gt: 0 }),
    () => double_inverse_equal({ lt: 0 }),
    () => [invert({ gte: 0 }), { lt: 0 }],
    () => [invert({ lte: 0 }), { gt: 0 }],
    () => [invert({ gt: 0 }), { lte: 0 }],
    () => [invert({ lt: 0 }), { gte: 0 }],
    () => double_inverse_equal({ gt: 0, lt: 1 }),
    () => double_inverse_equal({ or: [{ eq: 0 }, { eq: 1 }] }),
    () => [
      invert({ or: [{ gt: 1 }, { eq: 1, _test: 'ok' }] }),
      { lte: 1, not: { eq: 1 } }, // _test dropped
    ],
    () => throws(() => invert({ or: [{ gt: 1 }, { eq: 1, test: 'not ok' }] })),
    () => double_inverse_equal({ or: [{ gt: 1 }, { eq: 0 }] }),
    () => [invert({ or: [{ gt: 1 }, { eq: 0 }] }), { lte: 1, not: { eq: 0 } }],
    // note double-inversion can simplify and:... by merging domains
    () => [invert(invert({ and: [{ gte: 1 }, { eq: 1 }] })), { gte: 1, eq: 1 }],
    () => [
      invert({ and: [{ gte: 1 }, { eq: 1 }] }),
      { or: [{ lt: 1 }, { not: { eq: 1 } }] },
    ]
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
    () => throws(() => distance(0, true)), // non-object
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
    () => throws(() => distance(5, { or: [{ gt: 1 }, { lt: 3, test: 'no' }] }))
  )
}
