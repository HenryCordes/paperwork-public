import { CSSProperties, ChangeEvent, FocusEvent } from 'react'

interface LineItemProps {
  index: number
  style?: CSSProperties
  name?: string
  description?: string
  numberOfItems?: string | number
  priceIncludingTax?: string | number
  taxRate?: string | number
  changeHandler: (
    index: number,
  ) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  focusHandler: (e: FocusEvent<HTMLInputElement>) => void
  deleteHandler: (index: number) => () => void
  currencyFormatter: (amount: number) => string
}

const LineItem = ({
  index,
  description,
  numberOfItems,
  priceIncludingTax,
  taxRate,
  changeHandler,
  focusHandler,
  deleteHandler,
  currencyFormatter,
  style: _style,
}: LineItemProps) => {
  return (
    <div className="lineitem-row">
      <div>{index + 1}</div>
      <div>
        <input
          name="description"
          type="text"
          value={description}
          onChange={changeHandler(index)}
        />
      </div>
      <div>
        <input
          name="numberOfItems"
          type="number"
          step="1"
          value={numberOfItems}
          onChange={changeHandler(index)}
          onFocus={focusHandler}
        />
      </div>
      <div>
        <input
          name="priceIncludingTax"
          type="number"
          step="0.01"
          min="0.00"
          max="9999999.99"
          value={priceIncludingTax}
          onChange={changeHandler(index)}
          onFocus={focusHandler}
        />
      </div>
      <div>
        {currencyFormatter(Number(numberOfItems) * Number(priceIncludingTax))}
      </div>
      <div>
        <select name="taxRate" onChange={changeHandler(index)} value={taxRate}>
          <option value="0">0%</option>
          <option value="6">6%</option>
          <option value="9">9%</option>
          <option value="21">21%</option>
        </select>
      </div>
      <div>
        <button
          type="button"
          className="lineitem-button-delete"
          onClick={deleteHandler(index)}
        >
          <i className="icon-trash short" />
        </button>
      </div>
      <input
        type="hidden"
        name="totalLinePrice"
        onChange={changeHandler(index)}
        value={Number(numberOfItems) * Number(priceIncludingTax) || 0}
      />
    </div>
  )
}

export default LineItem
