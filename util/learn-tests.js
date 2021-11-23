function _test_from() {
  check(
    () => from('0', 'string'),
    () => from(0, 'integer'),
    () => from(0, 'number'),
    () => from(true, 'boolean'),
    () => !from('true', 'boolean'),
    () => from(1, [0, 1]),
    () => !from(2, [0, 1]),
    () => !from(false, [0, 1]), // sameValueZero
    () => from(NaN, [NaN, 1]), // sameValueZero
    () => from(0, {}), // no constraints = everything
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
    () => from(1, { or: [{ eq: 0 }, { eq: 1 }] }),
    () => from(1, { or: [{ gt: 1 }, { eq: 1 }] }),
    () => !from(1, { or: [{ gt: 1 }, { eq: 0 }] }),
    () => !from(1, { and: [{ eq: 0 }, { eq: 1 }] }),
    () => !from(1, { and: [{ gt: 1 }, { eq: 1 }] }),
    () => from(1, { and: [{ gte: 1 }, { eq: 1 }] })
  )
}
