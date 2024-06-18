// @flow
import { deepEqual } from "fast-equals";
import React from "react";

const isProduction = process.env.NODE_ENV === "production";
const DEBUG = false;

/**
 * Return the bottom coordinate of the layout.
 * 返回布局的底部坐标。
 * 它遍历给定的布局数组 layout，并找到每个网格项的底部位置 y + h，然后将其与当前的最大值 max 进行比较，更新最大值
 *
 * @param  {Array} layout Layout array.
 * @return {Number}       Bottom coordinate.
 */
export function bottom(layout) {
  let max = 0,
    bottomY;
  for (let i = 0, len = layout.length; i < len; i++) {
    bottomY = layout[i].y + layout[i].h;
    if (bottomY > max) max = bottomY;
  }
  return max;
}

// 克隆布局
export function cloneLayout(layout) {
  const newLayout = Array(layout.length);
  for (let i = 0, len = layout.length; i < len; i++) {
    newLayout[i] = cloneLayoutItem(layout[i]);
  }
  return newLayout;
}

// Modify a layoutItem inside a layout. Returns a new Layout,
//修改布局布局中的项。返回一个新布局，
// does not mutate. Carries over all other LayoutItems unmodified.
//不会发生变异。未经修改地承载所有其他布局项。
export function modifyLayout(layout, layoutItem) {
  const newLayout = Array(layout.length);
  for (let i = 0, len = layout.length; i < len; i++) {
    if (layoutItem.i === layout[i].i) {
      newLayout[i] = layoutItem;
    } else {
      newLayout[i] = layout[i];
    }
  }
  return newLayout;
}

// Function to be called to modify a layout item.
//要调用以修改布局项的函数。
// Does defensive clones to ensure the layout is not modified.
//进行防御克隆以确保布局不被修改。
export function withLayoutItem(
  layout,
  itemKey,
  cb
) {
  let item = getLayoutItem(layout, itemKey);
  if (!item) return [layout, null];
  item = cb(cloneLayoutItem(item)); // defensive clone then modify
  // FIXME could do this faster if we already knew the index
  layout = modifyLayout(layout, item);
  return [layout, item];
}

// Fast path to cloning, since this is monomorphic
//快速克隆，因为这是单态的
export function cloneLayoutItem(layoutItem) {
  return {
    w: layoutItem.w,
    h: layoutItem.h,
    x: layoutItem.x,
    y: layoutItem.y,
    i: layoutItem.i,
    minW: layoutItem.minW,
    maxW: layoutItem.maxW,
    minH: layoutItem.minH,
    maxH: layoutItem.maxH,
    moved: Boolean(layoutItem.moved),
    static: Boolean(layoutItem.static),
    // These can be null/undefined
    isDraggable: layoutItem.isDraggable,
    isResizable: layoutItem.isResizable,
    resizeHandles: layoutItem.resizeHandles,
    isBounded: layoutItem.isBounded
  };
}

/**
 * Comparing React `children` is a bit difficult. This is a good way to compare them.
 * 比较React“children”有点困难。这是比较它们的好方法。
 * This will catch differences in keys, order, and length.
 * 这将捕捉关键点、顺序和长度的差异。
 */
export function childrenEqual(a, b) {
  return (
    deepEqual(
      React.Children.map(a, c => c?.key),
      React.Children.map(b, c => c?.key)
    ) &&
    deepEqual(
      React.Children.map(a, c => c?.props["data-grid"]),
      React.Children.map(b, c => c?.props["data-grid"])
    )
  );
}

/**
 * See `fastRGLPropsEqual.js`.
 * We want this to run as fast as possible - it is called often - and to be
 * resilient to new props that we add. So rather than call lodash.isEqual,
 * which isn't suited to comparing props very well, we use this specialized
 * function in conjunction with preval to generate the fastest possible comparison
 * function, tuned for exactly our props.
 */
export const fastRGLPropsEqual = require("./fastRGLPropsEqual");

// Like the above, but a lot simpler.
export function fastPositionEqual(a, b) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * Given two layoutitems, check if they collide.
 * 给定两个元素布局，检查它们是否碰撞
 */
export function collides(l1, l2) {
  if (l1.i === l2.i) return false; // same element
  if (l1.x + l1.w <= l2.x) return false; // l1 is left of l2
  if (l1.x >= l2.x + l2.w) return false; // l1 is right of l2
  if (l1.y + l1.h <= l2.y) return false; // l1 is above l2
  if (l1.y >= l2.y + l2.h) return false; // l1 is below l2
  return true; // boxes overlap
}

/**
 * Given a layout, compact it. This involves going down each y coordinate and removing gaps
 * 给定布局，压缩它。这包括向下移动每个y坐标并消除间隙
 * between items.
 * 项目之间。
 * Does not modify layout items (clones). Creates a new layout array.
 * 不修改布局项目（克隆）。创建新的布局阵列
 * @param  {Array} layout Layout.
 * @param  {Boolean} verticalCompact Whether or not to compact the layout 是否压缩布局
 *   vertically.
 * @param  {Boolean} allowOverlap When `true`, allows overlapping grid items. 当“true”时，允许重叠网格项。
 * @return {Array}       Compacted Layout. 紧凑布局
 */
export function compact(
  layout,
  compactType,
  cols,
  allowOverlap
) {
  // Statics go in the compareWith array right away so items flow around them.
  // 1、存放移动处理后的元素或者不需要移动的元素的
  const compareWith = getStatics(layout);
  // We go through the items by row and column.
  // compactType 为 null的话，返回 layout
  const sorted = sortLayoutItems(layout, compactType);
  // Holding for new items.
  const out = Array(layout.length);

  // 逐个处理 sorted 内部的元素
  for (let i = 0, len = sorted.length; i < len; i++) {
    // 2、克隆 layoutItem
    let l = cloneLayoutItem(sorted[i]);

    // Don't move static elements
    if (!l.static) {
      // 3、重新布局（处理需要移动的元素）
      l = compactItem(compareWith, l, compactType, cols, sorted, allowOverlap);

      // Add to comparison array. We only collide with items before this one.
      //添加到比较数组。我们只与在此之前的项目发生碰撞。
      // Statics are already in this array.
      //Statics已经在此阵列中。
      compareWith.push(l);
    }

    // Add to output array to make sure they still come out in the right order.
    out[layout.indexOf(sorted[i])] = l;

    // Clear moved flag, if it exists.
    l.moved = false;
  }

  return out;
}

const heightWidth = { x: "w", y: "h" };
/**
 * Before moving item down, it will check if the movement will cause collisions and move those items down before.
 * 在向下移动项目之前，它将检查移动是否会导致碰撞，并在之前向下移动这些项目。
 * 将当前布局项 item 的轴向坐标 item[axis] 设置为目标位置 moveToCoord
 * layout是已经排序过===》sorted
 */
function resolveCompactionCollision(
  layout,
  item,
  moveToCoord,
  axis
) {
  const sizeProp = heightWidth[axis];
  // TODO: item[axis]+=1 然后找后面有没有元素碰撞?
  item[axis] += 1;
  const itemIndex = layout
    .map(layoutItem => {
      return layoutItem.i;
    })
    .indexOf(item.i);

  // Go through each item we collide with.
  // 如果 item（即 l）不是
  for (let i = itemIndex + 1; i < layout.length; i++) {
    const otherItem = layout[i];
    // Ignore static items
    if (otherItem.static) continue;

    // Optimization: we can break early if we know we're past this el
    //优化：如果我们知道我们已经过了这个el，我们可以早点休息
    // We can do this b/c it's a sorted layout
    //我们可以这样做b/c这是一个排序布局
    // 如果后面元素的y大于当前元素的y+h，跳出循环
    if (otherItem.y > item.y + item.h) break;

    // 如果 item 跟后面的元素 otherItem 有碰撞，循环处理
    if (collides(item, otherItem)) {
      resolveCompactionCollision(
        layout,
        otherItem,
        moveToCoord + item[sizeProp],
        axis
      );
    }
  }

  item[axis] = moveToCoord;
}

/**
 * 核心代码---布局整理
 * Compact an item in the layout.
 * 压缩布局中的项目
 * Modifies item.
 * 修改项目
 */
export function compactItem(
  compareWith,
  l,
  compactType,
  cols,
  fullLayout, // 排序过的layout
  allowOverlap
) {
  const compactV = compactType === "vertical";
  const compactH = compactType === "horizontal";
  if (compactV) {
    // Bottom 'y' possible is the bottom of the layout.
    //底部“y”可能是布局的底部。
    // This allows you to do nice stuff like specify {y: Infinity}
    //这允许你做一些不错的事情，比如指定{y:Infinity}
    // This is here because the layout must be sorted in order to get the correct bottom `y`.
    //这是因为必须对布局进行排序才能得到正确的底部“y”。
    l.y = Math.min(bottom(compareWith), l.y);
    // Move the element up as far as it can go without colliding.
    // 在不发生碰撞的情况下，尽可能向上移动元素。---布局压缩
    while (l.y > 0 && !getFirstCollision(compareWith, l)) {
      l.y--;
    }
  } else if (compactH) {
    // Move the element left as far as it can go without colliding.
    //在不发生碰撞的情况下，尽可能向左移动元素。
    while (l.x > 0 && !getFirstCollision(compareWith, l)) {
      l.x--;
    }
  }

  // Move it down, and keep moving it down if it's colliding.
  //向下移动，如果碰撞，继续向下移动。
  let collides;
  // Checking the compactType null value to avoid breaking the layout when overlapping is allowed.
  //检查compactType null值以避免在允许重叠时破坏布局。
  // 4、如果 compareWith 内部存在跟 l 碰撞的元素 collides，则移动 l 的位置为 collides 的 collides.y + collides.h（可以保证跟 collides 不再碰撞）
  while (
    (collides = getFirstCollision(compareWith, l)) &&
    !(compactType === null && allowOverlap)
  ) {
    if (compactH) {
      resolveCompactionCollision(fullLayout, l, collides.x + collides.w, "x");
    } else {
      resolveCompactionCollision(fullLayout, l, collides.y + collides.h, "y");
    }
    // Since we can't grow without bounds horizontally, if we've overflown, let's move it down and try again.
    if (compactH && l.x + l.w > cols) {
      l.x = cols - l.w;
      l.y++;
      // ALso move element as left as we can
      while (l.x > 0 && !getFirstCollision(compareWith, l)) {
        l.x--;
      }
    }
  }

  // Ensure that there are no negative positions
  l.y = Math.max(l.y, 0);
  l.x = Math.max(l.x, 0);

  return l;
}

/**
 * Given a layout, make sure all elements fit within its bounds.
 *
 * Modifies layout items.
 * 给定布局，确保所有元素都在其边界内，修改布局项。
 *
 * @param  {Array} layout Layout array.
 * @param  {Number} bounds Number of columns.
 */
export function correctBounds(
  layout,
  bounds
) {
  // 获取所有静态元素
  const collidesWith = getStatics(layout);
  for (let i = 0, len = layout.length; i < len; i++) {
    const l = layout[i];
    // Overflows right
    if (l.x + l.w > bounds.cols) l.x = bounds.cols - l.w;
    // Overflows left
    if (l.x < 0) {
      l.x = 0;
      l.w = bounds.cols;
    }
    if (!l.static) collidesWith.push(l);
    else {
      // If this is static and collides with other statics, we must move it down.
      // We have to do something nicer than just letting them overlap.
      // 如果这是静态的，并且与其他静态碰撞，我们必须将其向下移动。
      // 我们必须做一些比让它们重叠更好的事情。
      while (getFirstCollision(collidesWith, l)) {
        l.y++;
      }
    }
  }
  return layout;
}

/**
 * Get a layout item by ID. Used so we can override later on if necessary.
 * 按ID获取布局项。使用此项可以在以后进行覆盖（如有必要）。
 * @param  {Array}  layout Layout array.
 * @param  {String} id     ID
 * @return {LayoutItem}    Item at ID.
 */
export function getLayoutItem(layout, id) {
  for (let i = 0, len = layout.length; i < len; i++) {
    if (layout[i].i === id) return layout[i];
  }
}

/**
 * Returns the first item this layout collides with.
 * It doesn't appear to matter which order we approach this from, although
 * perhaps that is the wrong thing to do.
 * 获取第一个碰撞的元素
 *
 * @param  {Object} layoutItem Layout item.
 * @return {Object|undefined}  A colliding layout item, or undefined.
 */
export function getFirstCollision(
  layout,
  layoutItem
) {
  for (let i = 0, len = layout.length; i < len; i++) {
    if (collides(layout[i], layoutItem)) return layout[i];
  }
}

// 获取跟目标元素碰撞的所有元素
export function getAllCollisions(
  layout,
  layoutItem
) {
  return layout.filter(l => collides(l, layoutItem));
}

/**
 * Get all static elements.
 * 获取所有静态元素
 * @param  {Array} layout Array of layout objects.
 * @return {Array}        Array of static layout items..
 */
export function getStatics(layout) {
  return layout.filter(l => l.static);
}

/**
 * 核心代码
 * Move an element. Responsible for doing cascading movements of other elements.
 * 移动元素。负责其他元素的级联运动。
 * Modifies layout items.
 * 修改布局项
 *
 * @param  {Array}      layout            Full layout to modify.
 * @param  {LayoutItem} l                 element to move.
 * @param  {Number}     [x]               X position in grid units.
 * @param  {Number}     [y]               Y position in grid units.
 */
export function moveElement(
  layout,
  l,
  x,
  y,
  isUserAction,
  preventCollision,
  compactType,
  cols,
  allowOverlap
) {
  // If this is static and not explicitly enabled as draggable,
  //如果这是静态的并且没有被明确地启用为可拖动的，
  // no move is possible, so we can short-circuit this immediately.
  if (l.static && l.isDraggable !== true) return layout;

  // Short-circuit if nothing to do.
  // 位置没有变化
  if (l.y === y && l.x === x) return layout;

  log(
    `Moving element ${l.i} to [${String(x)},${String(y)}] from [${l.x},${l.y}]`
  );
  const oldX = l.x;
  const oldY = l.y;

  // 1、根据移动位置，对移动的对象进行x、y的赋值更新
  // tips：l 最后的位置在最后移动的 x、y（这时候没有碰撞）
  // 此时 layout 里面 l 的位置，是鼠标移动至的位置
  // This is quite a bit faster than extending the object
  //这比扩展对象快得多
  if (typeof x === "number") l.x = x;
  if (typeof y === "number") l.y = y;
  l.moved = true;

  // If this collides with anything, move it.
  //如果它与任何东西碰撞，请移动它。
  // When doing this comparison, we have to sort the items we compare with
  //进行此比较时，我们必须对所比较的项目进行排序
  // to ensure, in the case of multiple collisions, that we're getting the nearest collision.
  //以确保在多次碰撞的情况下，我们得到最近的碰撞。
  // compactType 为 null 的话，返回 layout
  let sorted = sortLayoutItems(layout, compactType);
  // compactType 为 null 的话，返回 false
  const movingUp =
    compactType === "vertical" && typeof y === "number"
      ? oldY >= y
      : compactType === "horizontal" && typeof x === "number"
        ? oldX >= x
        : false;
  // $FlowIgnore acceptable modification of read-only array as it was recently cloned
  // $FlowIgnore最近克隆的只读数组的可接受修改
  if (movingUp) sorted = sorted.reverse();

  // TODO: compactType为null，元素往上移动
  const noCompactTypeMovingUp = !compactType && typeof y === "number" ? oldY >= y : false;

  // 2、获取移动过程中碰撞的元素
  const collisions = getAllCollisions(sorted, l);
  const hasCollisions = collisions.length > 0;

  log('hasCollisions', { hasCollisions, allowOverlap, preventCollision })

  // We may have collisions. We can short-circuit if we've turned off collisions or allowed overlap.
  //我们可能会发生碰撞。如果我们关闭了碰撞或允许重叠。
  if (hasCollisions && allowOverlap) {
    // Easy, we don't need to resolve collisions. But we *did* change the layout,
    //简单，我们不需要解决冲突。但我们确实改变了布局，
    // so clone it on the way out.
    //所以在离开的时候克隆它。  
    return cloneLayout(layout);
  } else if (hasCollisions && preventCollision) {
    // If we are preventing collision but not allowing overlap, we need to
    //如果我们防止碰撞但不允许重叠，我们需要
    // revert the position of this element so it goes to where it came from, rather
    //恢复此元素的位置，使其返回到它的来源，而不是
    // than the user's desired location.
    //而不是用户的期望位置。
    log(`Collision prevented on ${l.i}, reverting.`);
    l.x = oldX;
    l.y = oldY;
    l.moved = false;
    return layout; // did not change so don't clone
  }

  // Move each item that collides away from this element.
  //将每个碰撞的项目移离此元素。
  for (let i = 0, len = collisions.length; i < len; i++) {
    const collision = collisions[i];
    log(
      `Resolving collision between ${l.i} at [${l.x},${l.y}] and ${collision.i} at [${collision.x},${collision.y}]`
    );

    // Short circuit so we can't infinite loop
    //短路，所以我们不能无限循环
    if (collision.moved) continue;

    // Don't move static items - we have to move *this* element away
    //不要移动静态项目-我们必须将*this*元素移走，此时 layout 内部的 l 是最新移动到的位置
    if (collision.static) {
      layout = moveElementAwayFromCollision(
        layout,
        collision,
        l,
        isUserAction,
        compactType,
        cols,
        noCompactTypeMovingUp
      );
    } else {
      // 3、移动碰撞的元素
      layout = moveElementAwayFromCollision(
        layout,
        l,
        collision,
        isUserAction,
        compactType,
        cols,
        noCompactTypeMovingUp
      );
    }
  }

  return layout;
}

/**
 * This is where the magic needs to happen - given a collision, move an element away from the collision.
 * *这就是魔法需要发生的地方——给定碰撞，将元素从碰撞中移开。
 * We attempt to move it up if there's room, otherwise it goes below.
 *如果有空间，我们会尝试将其向上移动，否则它会向下移动。
 *
 * @param  {Array} layout            Full layout to modify.
 * @param  {LayoutItem} collidesWith Layout item we're colliding with. 正在与冲突的布局项目
 * @param  {LayoutItem} itemToMove   Layout item we're moving. 布局我们正在移动的项目
 */
export function moveElementAwayFromCollision(
  layout,
  collidesWith,
  itemToMove,
  isUserAction,
  compactType,
  cols,
  noCompactTypeMovingUp
) {
  const compactH = compactType === "horizontal";
  // Compact vertically if not set to horizontal
  //如果未设置为水平，则垂直压缩
  const compactV = compactType === "vertical";
  const preventCollision = collidesWith.static; // we're already colliding (not for static items) //我们已经发生冲突（不适用于静态项目）

  // If there is enough space above the collision to put this element, move it there.
  //如果碰撞上方有足够的空间放置此元素，请将其移动到那里。
  // We only do this on the main collision as this can get funky in cascades and cause
  //我们只在主碰撞时这样做，因为这可能会在级联中变得怪异，并导致
  // unwanted swapping behavior.
  //不需要的交换行为。
  if (isUserAction) {
    // Reset isUserAction flag because we're not in the main collision anymore.
    //重置isUserAction标志，因为我们不再处于主冲突中。
    isUserAction = false;

    // 4、制作一个模拟项，如果没有设置compactH或者compactV，fakeItem是需要移动的元素 itemToMove（正在移动的元素所碰撞的元素）的copy（i不同）
    // Make a mock item so we don't modify the item here, only modify in moveElement.
    //制作一个模拟项，这样我们就不会在这里修改该项，只会在moveElement中修改。
    let fakeItem = {
      x: compactH ? Math.max(collidesWith.x - itemToMove.w, 0) : itemToMove.x,
      // 模拟项 fakeItem 的 y：就是将碰撞元素 itemToMove 移动到移动元素 collidesWith 顶部后的 y
      // y: compactV ? Math.max(collidesWith.y - itemToMove.h, 0) : itemToMove.y,
      y: compactV ? Math.max(collidesWith.y - itemToMove.h, 0) : itemToMove.y,
      w: itemToMove.w,
      h: itemToMove.h,
      i: "-1"
    };

    // TODO: 处理 compactType为空并且向下拖动的情况
    if (!compactType && !noCompactTypeMovingUp) {
      fakeItem = {
        x: itemToMove.x,
        y: Math.max(collidesWith.y - itemToMove.h, 0),
        w: itemToMove.w,
        h: itemToMove.h,
        i: "-1"
      };
    }

    // 5、寻找跟模拟项发生碰撞的对象（如果没有设置compactH或者compactV，firstCollision 是正在移动的元素，并且位置是更新后的）
    // 上下移动的时候，firstCollision 是第一个碰撞的元素（上面的元素）
    // 向下移动的时候，firstCollision=collidesWith，是正在拖动的元素
    // 向上移动的时候，firstCollision=itemToMove，是被挤的元素
    const firstCollision = getFirstCollision(layout, fakeItem);

    // 第一个跟模拟项碰撞的元素 firstCollision 的底部（y + h）大于移动项 collidesWith 的 y 坐标
    // TODO:(janko) 如果元素从上往下移动的话，collisionNorth 永远为true
    const collisionNorth =
      firstCollision && firstCollision.y + firstCollision.h > collidesWith.y;
    // 碰撞项的右侧边界（x + w）大于第一个发生碰撞的布局项的 x 坐标
    const collisionWest =
      firstCollision && collidesWith.x + collidesWith.w > firstCollision.x;

    // No collision? If so, we can go up there; otherwise, we'll end up moving down as normal
    //没有碰撞？如果是的话，我们可以上去；否则，我们将像往常一样向下移动
    if (!firstCollision) {
      log(
        `Doing reverse collision on ${itemToMove.i} up to [${fakeItem.x},${fakeItem.y}].`
      );
      // TODO: 处理 compactType为空并且向下拖动的情况
      if (!compactType && !noCompactTypeMovingUp) {
        return moveElement(
          layout,
          itemToMove,
          undefined,
          fakeItem.y,
          isUserAction,
          preventCollision,
          compactType,
          cols
        );
      }
      return moveElement(
        layout,
        itemToMove,
        compactH ? fakeItem.x : undefined,
        compactV ? fakeItem.y : undefined,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    } else if (collisionNorth && compactV) {
      return moveElement(
        layout,
        itemToMove,
        undefined,
        collidesWith.y + 1,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    } else if (collisionNorth && compactType == null) {
      // 6、改变移动元素跟碰撞元素的位置
      // 上移
      if (noCompactTypeMovingUp) {
        // collidesWith.y = Math.max(itemToMove.y - collidesWith.h, 0);
        // itemToMove.y = itemToMove.y + 1;
        // TODO: 被挤的元素的y，调整为移动元素的y+移动元素的h
        itemToMove.y = collidesWith.y + collidesWith.h;
        // return sortLayoutItemsByRowCol(layout);
      } else {
        // TODO: 不要让 itemToMove 元素下移，否则继续移动的时候，会导致元素上移
        // 下移
        // itemToMove.y = collidesWith.y + 1
        // TODO: 如果 下移 并且有碰撞元素的话，碰撞元素往下移动一个单位（留足空间给碰撞元素往上移动）
        moveElement(
          layout,
          itemToMove,
          undefined,
          itemToMove.y + 1,
          isUserAction,
          preventCollision,
          compactType,
          cols
        )
        // return sortLayoutItemsByRowCol(layout);
      }
      // return layout;
      // TODO: 移动后排序
      return sortLayoutItemsByRowCol(layout);
    } else if (collisionWest && compactH) {
      return moveElement(
        layout,
        collidesWith,
        itemToMove.x,
        undefined,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    }
  }

  const newX = compactH ? itemToMove.x + 1 : undefined;
  const newY = compactV ? itemToMove.y + 1 : undefined;

  if (newX == null && newY == null) {
    return layout;
  }
  return moveElement(
    layout,
    itemToMove,
    compactH ? itemToMove.x + 1 : undefined,
    compactV ? itemToMove.y + 1 : undefined,
    isUserAction,
    preventCollision,
    compactType,
    cols
  );
}

/**
 * Helper to convert a number to a percentage string.
 *
 * @param  {Number} num Any number
 * @return {String}     That number as a percentage.
 */
export function perc(num) {
  return num * 100 + "%";
}

/**
 * Helper functions to constrain dimensions of a GridItem
 */
const constrainWidth = (
  left,
  currentWidth,
  newWidth,
  containerWidth
) => {
  return left + newWidth > containerWidth ? currentWidth : newWidth;
};

const constrainHeight = (
  top,
  currentHeight,
  newHeight
) => {
  return top < 0 ? currentHeight : newHeight;
};

const constrainLeft = (left) => Math.max(0, left);

const constrainTop = (top) => Math.max(0, top);

const resizeNorth = (currentSize, { left, height, width }, _containerWidth) => {
  const top = currentSize.top - (height - currentSize.height);

  return {
    left,
    width,
    height: constrainHeight(top, currentSize.height, height),
    top: constrainTop(top)
  };
};

const resizeEast = (
  currentSize,
  { top, left, height, width },
  containerWidth
) => ({
  top,
  height,
  width: constrainWidth(
    currentSize.left,
    currentSize.width,
    width,
    containerWidth
  ),
  left: constrainLeft(left)
});

const resizeWest = (currentSize, { top, height, width }, containerWidth) => {
  const left = currentSize.left - (width - currentSize.width);

  return {
    height,
    width:
      left < 0
        ? currentSize.width
        : constrainWidth(
          currentSize.left,
          currentSize.width,
          width,
          containerWidth
        ),
    top: constrainTop(top),
    left: constrainLeft(left)
  };
};

const resizeSouth = (
  currentSize,
  { top, left, height, width },
  containerWidth
) => ({
  width,
  left,
  height: constrainHeight(top, currentSize.height, height),
  top: constrainTop(top)
});

const resizeNorthEast = (...args) =>
  resizeNorth(args[0], resizeEast(...args), args[2]);
const resizeNorthWest = (...args) =>
  resizeNorth(args[0], resizeWest(...args), args[2]);
const resizeSouthEast = (...args) =>
  resizeSouth(args[0], resizeEast(...args), args[2]);
const resizeSouthWest = (...args) =>
  resizeSouth(args[0], resizeWest(...args), args[2]);

const ordinalResizeHandlerMap = {
  n: resizeNorth,
  ne: resizeNorthEast,
  e: resizeEast,
  se: resizeSouthEast,
  s: resizeSouth,
  sw: resizeSouthWest,
  w: resizeWest,
  nw: resizeNorthWest
};

/**
 * Helper for clamping width and position when resizing an item.
 */
export function resizeItemInDirection(
  direction,
  currentSize,
  newSize,
  containerWidth
) {
  const ordinalHandler = ordinalResizeHandlerMap[direction];
  // Shouldn't be possible given types; that said, don't fail hard
  if (!ordinalHandler) return newSize;
  return ordinalHandler(
    currentSize,
    { ...currentSize, ...newSize },
    containerWidth
  );
}

export function setTransform({ top, left, width, height }) {
  // Replace unitless items with px
  const translate = `translate(${left}px,${top}px)`;
  return {
    transform: translate,
    WebkitTransform: translate,
    MozTransform: translate,
    msTransform: translate,
    OTransform: translate,
    width: `${width}px`,
    height: `${height}px`,
    position: "absolute"
  };
}

export function setTopLeft({ top, left, width, height }) {
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
    position: "absolute"
  };
}

/**
 * Get layout items sorted from top left to right and down.
 * 获取从左上到右下排序的布局项目。
 * @return {Array} Array of layout objects.
 * @return {Array}        Layout, sorted static items first.
 */
export function sortLayoutItems(
  layout,
  compactType
) {
  if (compactType === "horizontal") return sortLayoutItemsByColRow(layout);
  if (compactType === "vertical") return sortLayoutItemsByRowCol(layout);
  else return layout;
}

/**
 * Sort layout items by row ascending and column ascending.
 * 按行和列的升序对布局项目进行排序
 * Does not modify Layout.
 */
export function sortLayoutItemsByRowCol(layout) {
  // Slice to clone array as sort modifies
  // 使用 layout.slice(0) 进行数组克隆，以保留原始布局数组的不变性。这是因为 sort 方法会修改原始数组
  return layout.slice(0).sort(function (a, b) {
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) {
      return 1;
    } else if (a.y === b.y && a.x === b.x) {
      // Without this, we can get different sort results in IE vs. Chrome/FF
      return 0;
    }
    return -1;
  });
}

/**
 * Sort layout items by column ascending then row ascending.
 * 按列升序然后行升序对布局项目进行排序。
 * Does not modify Layout.
 */
export function sortLayoutItemsByColRow(layout) {
  return layout.slice(0).sort(function (a, b) {
    if (a.x > b.x || (a.x === b.x && a.y > b.y)) {
      return 1;
    }
    return -1;
  });
}

/**
 * Generate a layout using the initialLayout and children as a template.
 * Missing entries will be added, extraneous ones will be truncated.
 *
 * Does not modify initialLayout.
 *
 * @param  {Array}  initialLayout Layout passed in through props.
 * @param  {String} breakpoint    Current responsive breakpoint.
 * @param  {?String} compact      Compaction option.
 * @return {Array}                Working layout.
 */
export function synchronizeLayoutWithChildren(
  initialLayout,
  children,
  cols,
  compactType,
  allowOverlap
) {
  initialLayout = initialLayout || [];

  // Generate one layout item per child.
  const layout = [];
  React.Children.forEach(children, (child) => {
    // Child may not exist
    if (child?.key == null) return;

    const exists = getLayoutItem(initialLayout, String(child.key));
    const g = child.props["data-grid"];
    // Don't overwrite the layout item if it's already in the initial layout.
    // If it has a `data-grid` property, prefer that over what's in the layout.
    if (exists && g == null) {
      layout.push(cloneLayoutItem(exists));
    } else {
      // Hey, this item has a data-grid property, use it.
      if (g) {
        if (!isProduction) {
          validateLayout([g], "ReactGridLayout.children");
        }
        // FIXME clone not really necessary here
        layout.push(cloneLayoutItem({ ...g, i: child.key }));
      } else {
        // Nothing provided: ensure this is added to the bottom
        // FIXME clone not really necessary here
        layout.push(
          cloneLayoutItem({
            w: 1,
            h: 1,
            x: 0,
            y: bottom(layout),
            i: String(child.key)
          })
        );
      }
    }
  });

  // Correct the layout.
  const correctedLayout = correctBounds(layout, { cols: cols });
  return allowOverlap
    ? correctedLayout
    : compact(correctedLayout, compactType, cols);
}

/**
 * Validate a layout. Throws errors.
 *
 * @param  {Array}  layout        Array of layout items.
 * @param  {String} [contextName] Context name for errors.
 * @throw  {Error}                Validation error.
 */
export function validateLayout(
  layout,
  contextName = "Layout"
) {
  const subProps = ["x", "y", "w", "h"];
  if (!Array.isArray(layout))
    throw new Error(contextName + " must be an array!");
  for (let i = 0, len = layout.length; i < len; i++) {
    const item = layout[i];
    for (let j = 0; j < subProps.length; j++) {
      if (typeof item[subProps[j]] !== "number") {
        throw new Error(
          "ReactGridLayout: " +
          contextName +
          "[" +
          i +
          "]." +
          subProps[j] +
          " must be a number!"
        );
      }
    }
  }
}

// Legacy support for verticalCompact: false
export function compactType(
  props
) {
  const { verticalCompact, compactType } = props || {};
  return verticalCompact === false ? null : compactType;
}

function log(...args) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

export const noop = () => { };
