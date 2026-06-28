import { ChangeEvent, FocusEvent } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from 'react-beautiful-dnd'

import LineItem from './LineItem'

interface LineItemData {
  id?: string
  _id?: string
  name?: string
  description?: string
  numberOfItems?: string | number
  priceIncludingTax?: string | number
  taxRate?: string | number
}

interface LineItemsProps {
  items: LineItemData[]
  currencyFormatter: (amount: number) => string
  addHandler: () => void
  changeHandler: (
    index: number,
  ) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  focusHandler: (e: FocusEvent<HTMLInputElement>) => void
  deleteHandler: (index: number) => () => void
  reorderHandler: (items: LineItemData[]) => void
}

const LineItems = ({
  items,
  addHandler,
  reorderHandler,
  ...functions
}: LineItemsProps) => {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const reorder = (
      list: LineItemData[],
      startIndex: number,
      endIndex: number,
    ) => {
      const reordered = Array.from(list)
      const [removed] = reordered.splice(startIndex, 1)
      reordered.splice(endIndex, 0, removed)
      return reordered
    }

    const lineItems = reorder(
      items,
      result.source.index,
      result.destination.index,
    )

    reorderHandler(lineItems)
  }

  const styles = {
    listDraggingOver: 'list-drag-over',
  }

  return (
    <div className="lineitems">
      <div className="lineitem-add-button-row">
        <button
          className="btn btn-primary  no-right-margin"
          onClick={addHandler}
        >
          <i className="icon-add text-right" /> Nieuwe regel
        </button>
      </div>
      <div className="lineitems-container">
        <div className="lineitems-grid-table">
          <div className="lineitems-headers">
            <div>#</div>
            <div>Omschrijving</div>
            <div>Aantal</div>
            <div>Prijs (incl. BTW)</div>
            <div>Totaal (incl. BTW)</div>
            <div>BTW</div>
            <div></div>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="droppable">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  className={
                    snapshot.isDraggingOver ? styles.listDraggingOver : ''
                  }
                >
                  {items.map((item, i) => (
                    <Draggable
                      key={item.id ? item.id : item._id}
                      draggableId={i.toString()}
                      index={i}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={provided.draggableProps.style}
                          className={
                            snapshot.isDragging ? 'row-is-dragging' : ''
                          }
                        >
                          <LineItem
                            style={{ color: 'red' }}
                            key={i + (item.id ? item.id : (item._id ?? ''))}
                            index={i}
                            name={item.name}
                            description={item.description}
                            numberOfItems={item.numberOfItems}
                            priceIncludingTax={item.priceIncludingTax}
                            taxRate={item.taxRate}
                            {...functions}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </div>
  )
}

export default LineItems
