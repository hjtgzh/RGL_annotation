/* eslint-disable react/prop-types */
import React, { useRef, useEffect, forwardRef } from "react";
import { addEvent, removeEvent } from 'react-draggable/build/cjs/utils/domFns';

// 元素是否在另一个元素内部
const elementIsInChain = (elementToTraverse, elementToFind) => {
  if (elementToTraverse === elementToFind) {
    return elementToFind;
  }
  if (elementToTraverse.parentElement) {
    return elementIsInChain(elementToTraverse.parentElement, elementToFind);
  }
  return false;
};

// 子元素是否超出父元素
const elementIsOutParent = (ele, parent) => {
  const childRect = ele.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return childRect.left + childRect.width / 2 < parentRect.left ||
    childRect.right - childRect.width / 2 > parentRect.right ||
    childRect.top + childRect.height / 2 < parentRect.top ||
    childRect.bottom - childRect.height / 2 > parentRect.bottom;
};

// 隐藏占位元素
const hideRglPlaceholder = () => {
  const placeHolder = document.querySelector(".react-grid-placeholder");
  if (placeHolder) placeHolder.style.transform = "translate(-8000px, 0px)";
};

// 伪造drag-start事件
const createDragStartEvent = (element, mouseEvent) => {
  if (!element) return;

  const event = new Event("mousedown", { bubbles: true, cancelable: true });
  const original = element.getBoundingClientRect;
  // 使用一个临时的getBoundingClientRect函数来修改元素的初始位置
  element.getBoundingClientRect = () => {
    element.getBoundingClientRect = original;
    return {
      left: mouseEvent.clientX,
      top: mouseEvent.clientY,
    };
  };
  element.dispatchEvent(event);
};

// 拖动结束
const createDragStopEvent = element => {
  const event = new Event("mouseup", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
};

// eslint-disable-next-line react/display-name
const DraggableSource = forwardRef((props, ref) => {
  const {
    targetRef,
    children,
    onMouseDown,
    onMouseUp,
    uniKey,
    containerRef,
    data,
    mouseEvent,
    temp,
    hideElement = () => { },
    visibleElement = () => { },
    finalTempComponentList = () => { },
    ...rest
  } = props;
  // 元素移动成功标识
  const insertedRef = useRef(false);

  // 核心：给属性为temp的元素，则伪造drag-start事件，调整新元素的位置为当前鼠标位置
  useEffect(() => {
    const refCur = ref && ref.current;
    if (refCur && temp) {
      createDragStartEvent(refCur, mouseEvent);
    }
    return () => refCur && temp && createDragStopEvent(refCur);
  }, [ref, temp, mouseEvent]);

  useEffect(() => {
    return () => removeEvent(document, 'mouseup', handleDragStop);
  }, []);

  // mousemove 绑定事件
  const onDragOverwrite = (e) => {
    if (!targetRef || !containerRef) {
      return;
    }

    const mouseInContainer = elementIsInChain(e.target, targetRef.current) && !elementIsInChain(e.target, containerRef.current);
    // 判断子元素是否已经拖出父元素
    if (elementIsOutParent(e.target, containerRef.current) && !insertedRef.current) {
      if (onMouseUp) onMouseUp(e);
      hideElement(uniKey, data);
    }

    if (mouseInContainer && !insertedRef.current) {
      visibleElement(uniKey, { ...data, mouseEvent: { clientX: e.clientX, clientY: e.clientY } });
      insertedRef.current = true;
      // hideRglPlaceholder();
      return;
    }
  };

  const onStopOverwrite = (e) => {
    if (insertedRef.current) {
      finalTempComponentList();
      insertedRef.current = false;
    }
  };

  // onMouseDown 触发事件
  function handleMouseDown(e) {
    addEvent(document, 'mousemove', onDragOverwrite);
    addEvent(document, 'mouseup', handleDragStop);
    if (onMouseDown) onMouseDown(e);
  }

  // onMouseUp 触发事件
  function handleDragStop(e) {
    onStopOverwrite(e);
    removeEvent(document, 'mousemove', onDragOverwrite);
    if (!insertedRef.current) {
      return;
    }
    removeEvent(document, 'mouseup', handleDragStop);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleDragStop}
      ref={ref}
      {...rest}
    >
      {children}
    </div>
  );
});

export default DraggableSource;