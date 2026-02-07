import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'

const navItems = ['Today', 'This Week', 'Engine', 'Kids', 'Records', 'Settings']

const Nav = () => {
  return (
    <List>
      {navItems.map((label) => (
        <ListItemButton key={label}>
          <ListItemText primary={label} />
        </ListItemButton>
      ))}
    </List>
  )
}

export default Nav
