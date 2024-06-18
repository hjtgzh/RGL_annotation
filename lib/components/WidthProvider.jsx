// @flow
import * as React from "react";
import PropTypes from "prop-types";
import ResizeObserver from "resize-observer-polyfill";
import clsx from "clsx";

const layoutClassName = "react-grid-layout";

/*
 * A simple HOC that provides facility for listening to container resizes.
 *
 * The Flow type is pretty janky here. I can't just spread `WPProps` into this returned object - I wish I could - but it triggers
 * a flow bug of some sort that causes it to stop typechecking.
 */
export default function WidthProvideRGL(
  ComposedComponent
) {
  return class WidthProvider extends React.Component {
    static defaultProps = {
      measureBeforeMount: false
    };

    static propTypes = {
      // If true, will not render children until mounted. Useful for getting the exact width before
      // rendering, to prevent any unsightly resizing.
      measureBeforeMount: PropTypes.bool,
      className: PropTypes.string,
      style: PropTypes.object
    };

    state = {
      width: 1280,
      height: null
    };

    elementRef = React.createRef();
    mounted = false;
    resizeObserver;

    componentDidMount() {
      this.mounted = true;
      this.resizeObserver = new ResizeObserver(entries => {
        const node = this.elementRef.current;
        if (node instanceof HTMLElement) {
          const width = entries[0].contentRect.width;
          const height = entries[0].contentRect.height;
          this.setState({ width, height });
        }
      });
      const node = this.elementRef.current;
      if (node instanceof HTMLElement) {
        this.resizeObserver.observe(node);
      }
    }

    componentWillUnmount() {
      this.mounted = false;
      const node = this.elementRef.current;
      if (node instanceof HTMLElement) {
        this.resizeObserver.unobserve(node);
      }
      this.resizeObserver.disconnect();
    }

    render() {
      const { measureBeforeMount, ...rest } = this.props;
      if (measureBeforeMount && !this.mounted) {
        return (
          <div
            className={clsx(this.props.className, layoutClassName)}
            style={this.props.style}
            // $FlowIgnore ref types
            ref={this.elementRef}
          />
        );
      }

      return (
        <ComposedComponent
          innerRef={this.elementRef}
          {...rest}
          {...this.state}
        />
      );
    }
  };
}
