// @flow

// Helper for generating column width
// 用于生成列宽的帮助程序
export function calcGridColWidth(positionParams) {
  const { margin, containerPadding, containerWidth, cols } = positionParams;
  // containerPadding容器的左右内边距宽度、cols - 1个margin网格列之间的间距、cols是网格的列数
  // TODO:(janko) 减去margin[0] * (cols - 1)？：
  // 例如：在cols长度的距离种树，两头都没有树，每棵树宽度为 margin[0]，树之间的距离为 calcGridColWidth，
  return (
    (containerWidth - margin[0] * (cols - 1) - containerPadding[0] * 2) / cols
  );
}

// This can either be called:
// 这可以被称为：
// calcGridItemWHPx(w, colWidth, margin[0])
// or 或
// calcGridItemWHPx(h, rowHeight, margin[1])
// 计算 col 或者 row 的实际px
export function calcGridItemWHPx(
  gridUnits,
  colOrRowSize,
  marginPx
) {
  // 0 * Infinity === NaN, which causes problems with resize contraints
  // 检查 gridUnits 是否是有限的数字。如果 gridUnits 不是有限数字（例如 Infinity 或 NaN），则直接返回 gridUnits，以避免后续计算中的问题。
  // colOrRowSize 是每个网格列或行的大小，
  // gridUnits 是以网格单元数表示的宽度或高度，
  // marginPx 是网格项之间的间距（以像素为单位）。
  if (!Number.isFinite(gridUnits)) return gridUnits;
  // TODO:(janko)加上Math.max(0, gridUnits - 1) * marginPx？跟calcGridColWidth对应？
  // calcGridItemWHPx类似于，将种的树拆开成多段两头都没有树的情形，计算长度（被拆开的多段，可以用marginPx去拼接，多个元素间的 marginPx 间距）
  return Math.round(
    colOrRowSize * gridUnits + Math.max(0, gridUnits - 1) * marginPx
  );
}

/**
 * Return position on the page given an x, y, w, h.
 * left, top, width, height are all in pixels.
 * 返回给定x、y、w、h的页面上的位置。
 * 左、上、宽、高均以像素为单位。
 * @param  {PositionParams} positionParams  Parameters of grid needed for coordinates calculations. 坐标计算所需的网格参数。
 * @param  {Number}  x                      X coordinate in grid units. x以网格为单位的x坐标。
 * @param  {Number}  y                      Y coordinate in grid units. y以网格为单位的y坐标。
 * @param  {Number}  w                      W coordinate in grid units. w坐标，单位为网格。
 * @param  {Number}  h                      H coordinate in grid units. h以网格为单位的h坐标。
 * @return {Position}                       Object containing coords. 包含坐标的对象。
 */
export function calcGridItemPosition(
  positionParams,
  x,
  y,
  w,
  h,
  state
) {
  const { margin, containerPadding, rowHeight } = positionParams;
  const colWidth = calcGridColWidth(positionParams);
  const out = {};

  // If resizing, use the exact width and height as returned from resizing callbacks.
  if (state && state.resizing) {
    out.width = Math.round(state.resizing.width);
    out.height = Math.round(state.resizing.height);
  }
  // Otherwise, calculate from grid units.
  else {
    out.width = calcGridItemWHPx(w, colWidth, margin[0]);
    out.height = calcGridItemWHPx(h, rowHeight, margin[1]);
  }

  // If dragging, use the exact width and height as returned from dragging callbacks.
  if (state && state.dragging) {
    out.top = Math.round(state.dragging.top);
    out.left = Math.round(state.dragging.left);
  } else if (
    state &&
    state.resizing &&
    typeof state.resizing.top === "number" &&
    typeof state.resizing.left === "number"
  ) {
    out.top = Math.round(state.resizing.top);
    out.left = Math.round(state.resizing.left);
  }
  // Otherwise, calculate from grid units.
  // top、left的计算是 （树+树之间的间距）*x 跟width、height的计算（calcGridItemWHPx）不同
  // ps：比如 cols为12（11棵树，12个colWidth），元素长度w为10（9棵树，10个colWidth）， y为2（2棵树，2个colWidth），所以有下面的算法
  else {
    out.top = Math.round((rowHeight + margin[1]) * y + containerPadding[1]);
    out.left = Math.round((colWidth + margin[0]) * x + containerPadding[0]);
  }

  return out;
}

/**
 * Translate x and y coordinates from pixels to grid units.
 * 将x和y坐标从像素转换为栅格单位。
 * @param  {PositionParams} positionParams  Parameters of grid needed for coordinates calculations. 坐标计算所需的网格参数。
 * @param  {Number} top                     Top position (relative to parent) in pixels. top顶部位置（相对于父级）（以像素为单位）。
 * @param  {Number} left                    Left position (relative to parent) in pixels. left左位置（相对于父级）（以像素为单位）。
 * @param  {Number} w                       W coordinate in grid units. w坐标，单位为网格。
 * @param  {Number} h                       H coordinate in grid units. h以网格为单位的h坐标。
 * @return {Object}                         x and y in grid units. x和y以网格为单位。
 */
export function calcXY(
  positionParams,
  top,
  left,
  w,
  h
) {
  const { margin, cols, rowHeight, maxRows, containerPadding } = positionParams;
  const colWidth = calcGridColWidth(positionParams);

  // left = colWidth * x + margin * (x + 1)
  // l = cx + m(x+1)
  // l = cx + mx + m
  // l - m = cx + mx
  // l - m = x(c + m)
  // (l - m) / (c + m) = x
  // x = (left - margin) / (coldWidth + margin)
  // 根据 calcGridItemPosition 里面的  out.top 计算结果反过来计算
  // TODO:(janko) 计算有问题，Math.round((left - containerPadding[0]) / (colWidth + margin[0]))
  let x = Math.round((left - containerPadding[0]) / (colWidth + margin[0]));
  let y = Math.round((top - containerPadding[1]) / (rowHeight + margin[1]));

  // Capping
  // 取 0-cols - w中间的值，不超过 cols 跟 maxRows
  x = clamp(x, 0, cols - w);
  y = clamp(y, 0, maxRows - h);

  return { x, y };
}

/**
 * Given a height and width in pixel values, calculate grid units. 
 * 给定像素值的高度和宽度，计算网格单位。
 * @param  {PositionParams} positionParams  Parameters of grid needed for coordinates calcluations. PositionParams坐标计算所需的网格参数。
 * @param  {Number} height                  Height in pixels. height以像素为单位的高度
 * @param  {Number} width                   Width in pixels. width以像素为单位的宽度
 * @param  {Number} x                       X coordinate in grid units. x以网格为单位的x坐标
 * @param  {Number} y                       Y coordinate in grid units. y以网格为单位的y坐标
 * @param {String} handle Resize Handle.
 * @return {Object}                         w, h as grid units. w，h作为网格单位。
 */
export function calcWH(
  positionParams,
  width,
  height,
  x,
  y,
  handle
) {
  const { margin, maxRows, cols, rowHeight } = positionParams;
  const colWidth = calcGridColWidth(positionParams);

  // width = colWidth * w - (margin * (w - 1))
  // ...
  // w = (width + margin) / (colWidth + margin)
  // 根据 calcGridItemWHPx 里面的计算结果反过来计算
  const w = Math.round((width + margin[0]) / (colWidth + margin[0]));
  const h = Math.round((height + margin[1]) / (rowHeight + margin[1]));

  // Capping
  let _w = clamp(w, 0, cols - x);
  let _h = clamp(h, 0, maxRows - y);
  if (["sw", "w", "nw"].indexOf(handle) !== -1) {
    _w = clamp(w, 0, cols);
  }
  if (["nw", "n", "ne"].indexOf(handle) !== -1) {
    _h = clamp(h, 0, maxRows);
  }
  return { w: _w, h: _h };
}

// Similar to _.clamp
// 返回限制在 lowerBound 和 upperBound 之间的值
export function clamp(
  num,
  lowerBound,
  upperBound
) {
  return Math.max(Math.min(num, upperBound), lowerBound);
}
